-- ============================================================
-- M23: Model DanaModal — pinjaman langsung cair + Arus Kas +
--      status keandalan 3 level (LANCAR / PERINGATAN / MACET)
--
-- Keputusan klien (5 Nov 2026):
--   1. Alur approval DIHAPUS — pinjaman langsung cair (disbursed)
--   2. Cicilan bertahap DIPERTAHANKAN (parsial, 1-52 minggu / 1-3 bln)
--   3. Tambah tabel cash_transactions (kas masuk/keluar)
--   4. Status keandalan nasabah 3 level
--   5. Minimum pinjaman tetap Rp50.000 (M17)
--   6. Bunga flat 20% / periode tetap
-- ============================================================

-- ---------- 1. Arus Kas: buku mutasi kas masuk & keluar ----------
create table if not exists public.cash_transactions (
  id           uuid primary key default gen_random_uuid(),
  tipe         text not null check (tipe in ('MASUK', 'KELUAR')),
  kategori     text not null default '',
  loan_id      uuid references public.loans(id) on delete set null,
  nasabah_id   uuid references public.profiles(id) on delete set null,
  pihak        text not null default '',
  metode       text not null default 'Tunai',
  nominal      bigint not null check (nominal > 0),
  catatan      text not null default '',
  dicatat_oleh uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cash_created on public.cash_transactions(created_at desc);
create index if not exists idx_cash_tipe    on public.cash_transactions(tipe, created_at desc);
create index if not exists idx_cash_loan    on public.cash_transactions(loan_id) where loan_id is not null;

alter table public.cash_transactions enable row level security;
drop policy if exists "cash admin all" on public.cash_transactions;
create policy "cash admin all" on public.cash_transactions for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 2. Status keandalan nasabah (3 level) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_keandalan') then
    create type status_keandalan as enum ('LANCAR', 'PERINGATAN', 'MACET');
  end if;
end $$;

alter table public.profiles
  add column if not exists status_keandalan status_keandalan not null default 'LANCAR';

create or replace function public.hitung_status_keandalan(p_user_id uuid)
returns status_keandalan language plpgsql stable security definer set search_path = public as $$
declare
  v_macet      boolean;
  v_peringatan boolean;
begin
  select exists (
    select 1 from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.user_id = p_user_id
      and i.status <> 'paid'
      and i.due_date < (now() at time zone 'Asia/Jakarta')::date
  ) into v_macet;
  if v_macet then return 'MACET'; end if;

  select exists (
    select 1 from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.user_id = p_user_id
      and i.status = 'paid'
      and i.paid_at::date > i.due_date
  ) into v_peringatan;
  if v_peringatan then return 'PERINGATAN'; end if;

  return 'LANCAR';
end;
$$;

create or replace function public.refresh_status_keandalan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if tg_table_name = 'installments' then
    select l.user_id into v_user from public.loans l where l.id = new.loan_id;
  else
    v_user := new.user_id;
  end if;
  if v_user is not null then
    update public.profiles
       set status_keandalan = public.hitung_status_keandalan(v_user)
     where id = v_user;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_keandalan_inst on public.installments;
create trigger trg_refresh_keandalan_inst
  after insert or update of status, paid_at on public.installments
  for each row execute function public.refresh_status_keandalan();

drop trigger if exists trg_refresh_keandalan_loan on public.loans;
create trigger trg_refresh_keandalan_loan
  after insert on public.loans
  for each row execute function public.refresh_status_keandalan();

-- ---------- 3. Hapus alur approval: pinjaman langsung cair ----------

-- 3a-pre. Policy insert nasabah masih mengunci status 'submitted' — harus dilepas
--         SEBELUM enum di-drop, kalau tidak Postgres menolak (dependency).
drop policy if exists "own loans ins" on public.loans;

-- 3a. Status historis yang masih nyangkut di tahap approval -> disbursed
update public.loans set status = 'disbursed'
 where status in ('submitted', 'under_review', 'approved');

-- 3b. Enum status disederhanakan
create type loan_status_v2 as enum ('disbursed', 'active', 'completed', 'rejected');
alter table public.loans alter column status drop default;
alter table public.loans
  alter column status type loan_status_v2 using status::text::loan_status_v2;
drop type loan_status;
alter type loan_status_v2 rename to loan_status;
alter table public.loans alter column status set default 'disbursed';

-- 3c. loans_guard_insert: 'submitted' sudah tidak ada di enum
create or replace function public.loans_guard_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.status        = 'disbursed';
    new.interest_rate = 20.00;
    new.late_fee      = 0;
    new.decided_by    = null;
    new.decided_at    = null;
    new.dicatat_oleh  = null;
    if new.frequency is null then new.frequency = 'weekly'; end if;
    if new.frequency = 'monthly' and new.tenor_months not in (1,3) then
      raise exception 'Untuk bulanan pilih tenor 1 atau 3 bulan';
    end if;
    if new.frequency = 'weekly' and (new.tenor_months < 1 or new.tenor_months > 52) then
      raise exception 'Untuk mingguan tenor 1-52 minggu';
    end if;
    if new.requested_amount is null then new.requested_amount = new.amount; end if;
    if new.amount is null then new.amount = new.requested_amount; end if;
    if new.amount <> new.requested_amount then new.amount = new.requested_amount; end if;
    new.monthly_payment = ceil((new.amount + new.amount * new.interest_rate / 100) / new.tenor_months)::bigint;
  else
    if new.requested_amount is null then new.requested_amount = new.amount; end if;
    if new.frequency is null then new.frequency = 'weekly'; end if;
  end if;
  return new;
end;
$$;

-- 3d. admin_create_loan: langsung disbursed + cicilan + catat kas keluar
create or replace function public.admin_create_loan(
  p_user_id uuid,
  p_amount bigint,
  p_tenor int,
  p_frequency loan_frequency,
  p_purpose text default '',
  p_collateral_type text default '',
  p_collateral_detail text default ''
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_payment bigint;
begin
  if not public.is_admin() then
    raise exception 'Only admin can create loans';
  end if;
  if p_amount is null or p_amount < 50000 or p_amount > 20000000 then
    raise exception 'Nominal harus Rp50rb - Rp20jt';
  end if;
  if p_frequency = 'monthly' and p_tenor not in (1,3) then
    raise exception 'Untuk bulanan pilih tenor 1 atau 3 bulan';
  end if;
  if p_frequency = 'weekly' and (p_tenor < 1 or p_tenor > 52) then
    raise exception 'Untuk mingguan tenor 1-52 minggu';
  end if;

  v_payment := ceil((p_amount + p_amount * 20.00 / 100) / p_tenor)::bigint;

  insert into public.loans (
    user_id, amount, requested_amount, tenor_months, frequency,
    monthly_payment, purpose, collateral_type, collateral_detail,
    interest_rate, late_fee, status, dicatat_oleh
  )
  values (
    p_user_id, p_amount, p_amount, p_tenor, p_frequency,
    v_payment, coalesce(p_purpose,''), coalesce(p_collateral_type,''),
    coalesce(p_collateral_detail,''),
    20.00, 0, 'disbursed', auth.uid()
  )
  returning id into v_id;

  if p_frequency = 'weekly' then
    insert into public.installments (loan_id, seq, due_date, amount)
    select v_id, g, ((now() at time zone 'Asia/Jakarta')::date + (g * 7)), v_payment
      from generate_series(1, p_tenor) g;
  else
    insert into public.installments (loan_id, seq, due_date, amount)
    select v_id, g, ((now() at time zone 'Asia/Jakarta')::date + (g || ' month')::interval), v_payment
      from generate_series(1, p_tenor) g;
  end if;

  -- Arus Kas: pencairan = uang keluar
  insert into public.cash_transactions (tipe, kategori, loan_id, nasabah_id, pihak, metode, nominal, catatan, dicatat_oleh)
  values ('KELUAR', 'Pencairan Pinjaman', v_id, p_user_id,
          (select full_name from public.profiles where id = p_user_id),
          'Tunai', p_amount, 'Pencairan pinjaman ' || v_id::text, auth.uid());

  return v_id;
end;
$$;

-- 3e. Fungsi approval tidak lagi dipakai
drop function if exists public.approve_loan(uuid, bigint);
drop function if exists public.reject_loan(uuid, text);

-- ---------- 4. Pembayaran & koreksi ikut menulis ke Arus Kas ----------
create or replace function public.record_cash_payment(p_installment_id uuid, p_amount bigint, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  tgt record; lr record;
  v_to_apply bigint; v_left bigint; cur record;
  v_loan_total_due bigint; v_flows int;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mencatat pembayaran';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal pembayaran harus lebih dari 0';
  end if;
  select * into tgt from public.installments where id = p_installment_id for update;
  if tgt.id is null then
    raise exception 'Cicilan tidak ditemukan';
  end if;
  select * into lr from public.loans where id = tgt.loan_id;
  if lr.status not in ('disbursed','active') then
    raise exception 'Pinjaman tidak dalam status berjalan';
  end if;
  -- guard total: tidak boleh terima duit melebihi sisa hutang
  select coalesce(sum(i.amount - coalesce(i.amount_paid,0)),0) into v_loan_total_due
  from public.installments i where i.loan_id = tgt.loan_id and i.status <> 'paid';
  if p_amount > v_loan_total_due then
    raise exception 'Nominal melebihi total sisa hutang';
  end if;
  v_left := p_amount; v_flows := 0;
  -- cicilan target dulu
  update public.installments
     set amount_paid = coalesce(amount_paid,0) + least(v_left, amount - coalesce(amount_paid,0)),
         status = case when coalesce(amount_paid,0) + least(v_left, amount - coalesce(amount_paid,0)) >= amount then 'paid' else status end,
         paid_at = case when coalesce(amount_paid,0) + least(v_left, amount - coalesce(amount_paid,0)) >= amount then now() else paid_at end,
         dicatat_oleh = auth.uid()
   where id = tgt.id;
  v_to_apply := least(v_left, tgt.amount - coalesce(tgt.amount_paid,0));
  v_left := v_left - v_to_apply;
  insert into public.payments (loan_id, installment_id, nasabah_id, dicatat_oleh, amount, note)
  values (tgt.loan_id, tgt.id, lr.user_id, auth.uid(), v_to_apply, coalesce(p_note,''));
  -- kelebihan mengalir ke cicilan berikutnya (due terdekat = tunggakan dulu)
  for cur in select * from public.installments
             where loan_id = tgt.loan_id and status <> 'paid' and id <> tgt.id
             order by due_date, seq for update
  loop
    exit when v_left <= 0;
    v_to_apply := least(v_left, cur.amount - coalesce(cur.amount_paid,0));
    if v_to_apply <= 0 then continue; end if;
    v_flows := v_flows + 1;
    update public.installments
       set amount_paid = coalesce(amount_paid,0) + v_to_apply,
           status = case when coalesce(amount_paid,0) + v_to_apply >= amount then 'paid' else status end,
           paid_at = case when coalesce(amount_paid,0) + v_to_apply >= amount then now() else paid_at end,
           dicatat_oleh = auth.uid()
     where id = cur.id;
    v_left := v_left - v_to_apply;
    insert into public.payments (loan_id, installment_id, nasabah_id, dicatat_oleh, amount, note)
    values (tgt.loan_id, cur.id, lr.user_id, auth.uid(), v_to_apply,
            'Kelebihan dari cicilan #' || tgt.seq || coalesce(' ' || nullif(p_note,''), ''));
  end loop;
  -- M23: Arus Kas — catat uang masuk otomatis dari pembayaran nasabah
  insert into public.cash_transactions (tipe, kategori, loan_id, nasabah_id, pihak, metode, nominal, catatan, dicatat_oleh)
  values ('MASUK', 'Pembayaran Angsuran/Pelunasan', tgt.loan_id, lr.user_id,
          (select full_name from public.profiles where id = lr.user_id),
          'Tunai', p_amount, coalesce(p_note,''), auth.uid());

  if lr.status = 'disbursed' then
    update public.loans set status = 'active' where id = lr.id;
  end if;
  update public.loans set dicatat_oleh = auth.uid() where id = lr.id;
  insert into public.notifications (user_id, title, body, type)
  values (lr.user_id,
    case when not exists (select 1 from public.installments where loan_id = tgt.loan_id and status <> 'paid')
         then 'Pinjaman Lunas' else 'Pembayaran Diterima' end,
    'Pembayaran sebesar Rp' || p_amount || ' telah diterima.' ||
    case when v_flows > 0 then ' Kelebihan otomatis diteruskan ke ' || v_flows || ' cicilan berikutnya.' else '' end ||
    ' Terima kasih!', 'info');
  if not exists (select 1 from public.installments where loan_id = tgt.loan_id and status <> 'paid') then
    update public.loans set status='completed' where id = lr.id;
  end if;
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pm record; v_reason text;
begin
  v_reason := btrim(coalesce(p_reason,''));
  if v_reason = '' then
    raise exception 'Alasan koreksi wajib diisi';
  end if;
  select * into pm from public.payments where id = p_payment_id for update;
  if pm.id is null then
    raise exception 'Transaksi tidak ditemukan';
  end if;
  if pm.amount <= 0 then
    raise exception 'Transaksi koreksi tidak dapat dikoreksi lagi';
  end if;
  if exists (select 1 from public.payments where void_of = pm.id) then
    raise exception 'Transaksi ini sudah pernah dikoreksi';
  end if;
  if not public.is_admin() then
    raise exception 'Hanya admin yang dapat mengoreksi';
  end if;
  -- baris lawan negatif
  insert into public.payments (loan_id, installment_id, nasabah_id, dicatat_oleh, amount, note, void_of, void_reason)
  values (pm.loan_id, pm.installment_id, pm.nasabah_id, auth.uid(),
          -pm.amount, 'KOREKSI: ' || v_reason, pm.id, v_reason);
  update public.payments set voided_at = now(), void_reason = v_reason where id = pm.id;
  -- M23: Arus Kas — uang keluar karena koreksi pembayaran
  insert into public.cash_transactions (tipe, kategori, loan_id, nasabah_id, pihak, metode, nominal, catatan, dicatat_oleh)
  values ('KELUAR', 'Koreksi Pembayaran', pm.loan_id, pm.nasabah_id,
          (select full_name from public.profiles where id = pm.nasabah_id),
          'Tunai', pm.amount, 'KOREKSI: ' || v_reason, auth.uid());
  -- kembalikan amount_paid cicilan
  if pm.installment_id is not null then
    update public.installments
       set amount_paid = greatest(0, coalesce(amount_paid,0) - pm.amount)
     where id = pm.installment_id;
    update public.installments
       set status = case when amount_paid >= amount then 'paid'
                         when due_date < (now() at time zone 'Asia/Jakarta')::date then 'overdue'
                         else 'unpaid' end,
           paid_at = case when amount_paid >= amount then paid_at else null end
     where id = pm.installment_id;
  end if;
  -- loan bisa balik dari completed bila ada cicilan belum lunas
  update public.loans
     set status = case when status = 'completed'
                       and exists (select 1 from public.installments
                                   where loan_id = pm.loan_id and status <> 'paid')
                       then 'active' else status end
   where id = pm.loan_id;
  -- notifikasi ke nasabah
  insert into public.notifications (user_id, title, body, type)
  select l.user_id, 'Koreksi Pembayaran',
         'Terdapat koreksi pencatatan pembayaran sebesar Rp' || pm.amount ||
         '. Alasan: ' || v_reason || '. Sisa hutang Anda telah disesuaikan.', 'info'
  from public.loans l where l.id = pm.loan_id;
end;
$$;

-- ---------- 5. Segarkan status keandalan semua nasabah ----------
update public.profiles p
   set status_keandalan = public.hitung_status_keandalan(p.id)
 where p.role = 'nasabah';

-- ---------- 6. RPC ringkasan Arus Kas per hari (WIB) ----------
create or replace function public.kas_harian(
  p_page int default 1,
  p_page_size int default 50,
  p_dari date default null,
  p_sampai date default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size int := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset int := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 200);
begin
  if not public.is_admin() then
    raise exception 'Only admin can list kas';
  end if;

  return (
    with agg as (
      select
        (c.created_at at time zone 'Asia/Jakarta')::date as tanggal,
        coalesce(sum(case when c.tipe = 'MASUK'  then c.nominal else 0 end), 0)::bigint as masuk,
        coalesce(sum(case when c.tipe = 'KELUAR' then c.nominal else 0 end), 0)::bigint as keluar,
        count(*)::int as jumlah
      from public.cash_transactions c
      where (p_dari is null or (c.created_at at time zone 'Asia/Jakarta')::date >= p_dari)
        and (p_sampai is null or (c.created_at at time zone 'Asia/Jakarta')::date <= p_sampai)
      group by 1
    )
    select json_build_object(
      'total', (select count(*) from agg),
      'page', greatest(coalesce(p_page, 1), 1),
      'pageSize', v_size,
      'rows', (select coalesce(json_agg(r order by r.tanggal desc), '[]'::json)
                 from (select tanggal, masuk, keluar, (masuk - keluar) as net, jumlah
                         from agg
                        order by tanggal desc
                        limit v_size offset v_offset) r)
    )
  );
end;
$$;
