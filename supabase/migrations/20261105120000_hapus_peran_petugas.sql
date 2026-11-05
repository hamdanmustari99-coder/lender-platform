-- M21: hapus peran petugas & nasabah — aplikasi hanya untuk admin/owner.
--
-- Revisi operator (5 Nov 2026): "3 peran itu hilang karena yang menggunakan
-- aplikasi nya cuma admin/owner aja." Mobile app Flutter dihapus sepenuhnya;
-- yang tersisa hanya admin web.
--
-- Keputusan desain:
--   * enum user_role disederhanakan jadi ('admin', 'nasabah').
--     'nasabah' DIPERTAHANKAN karena profiles.user_id tetap menunjuk ke nasabah
--     sebagai DATA (pemilik pinjaman), bukan sebagai pengguna aplikasi.
--     Nasabah tidak login lagi — akun auth dibuat oleh admin lewat edge function.
--   * 'petugas' & 'borrower' (sisa migrasi v1.0) dibuang dari enum.
--   * Tabel collection_routes & calon_nasabah dibuang (fitur petugas lapangan).
--   * Semua RLS policy & RPC yang mengecek is_petugas() disederhanakan jadi
--     is_admin() saja.
--   * payments.petugas_id & loans.collected_by & installments.paid_by
--     DIHAPUS — pencatat sekarang selalu admin. Kolom diganti nama supaya
--     jejak audit tetap jelas: dicatat_oleh (uuid -> profiles.id).
--
-- Catatan: data historis TIDAK dihapus. Hanya kolom penanda petugas yang
-- dibuang, dan nilai lama (petugas_id) disalin ke dicatat_oleh lebih dulu.

-- ============================================================
-- 1. Siapkan kolom pengganti SEBELUM enum diubah
-- ============================================================

-- payments: petugas_id -> dicatat_oleh
alter table public.payments
  add column if not exists dicatat_oleh uuid references public.profiles(id) on delete set null;

update public.payments set dicatat_oleh = petugas_id where dicatat_oleh is null;

-- loans: collected_by -> dicatat_oleh
alter table public.loans
  add column if not exists dicatat_oleh uuid references public.profiles(id) on delete set null;

update public.loans set dicatat_oleh = collected_by where dicatat_oleh is null;

-- installments: paid_by -> dicatat_oleh
alter table public.installments
  add column if not exists dicatat_oleh uuid references public.profiles(id) on delete set null;

update public.installments set dicatat_oleh = paid_by where dicatat_oleh is null;

-- ============================================================
-- 2. Buang tabel fitur petugas
-- ============================================================

drop table if exists public.calon_nasabah cascade;
drop table if exists public.collection_routes cascade;

-- ============================================================
-- 3. Sederhanakan enum role
-- ============================================================

-- Semua user non-admin yang masih ada diubah jadi 'nasabah' dulu, supaya
-- cast enum tidak gagal.
update public.profiles set role = 'nasabah' where role <> 'admin';

-- Buat enum baru lalu pindahkan kolom (Postgres tidak bisa DROP VALUE enum).
create type user_role_v2 as enum ('admin', 'nasabah');

-- default harus dilepas dulu, kalau tidak cast gagal (42804)
alter table public.profiles alter column role drop default;

alter table public.profiles
  alter column role type user_role_v2 using role::text::user_role_v2;

drop type user_role;
alter type user_role_v2 rename to user_role;

-- default role untuk user baru (kalau ada) = nasabah
alter table public.profiles
  alter column role set default 'nasabah';

-- ============================================================
-- 4. (kolom penanda petugas dibuang di bagian 7b, SETELAH policy
--     yang bergantung padanya dilepas — kalau tidak, DROP COLUMN gagal)
-- ============================================================

-- ============================================================
-- 5. Index: sesuaikan dengan kolom baru
-- ============================================================

drop index if exists idx_profiles_petugas;
drop index if exists idx_pay_petugas;

create index if not exists idx_pay_dicatat on public.payments(dicatat_oleh, paid_at);

-- ============================================================
-- 7. RLS: hapus policy petugas, sisakan admin + pemilik data
-- ============================================================

-- payments
drop policy if exists "pay write petugas" on public.payments;
drop policy if exists "pay read" on public.payments;
create policy "pay read" on public.payments for select
  using (auth.uid() = nasabah_id or public.is_admin());
create policy "pay write" on public.payments for insert
  with check (public.is_admin());

-- loans
drop policy if exists "own loans read" on public.loans;
drop policy if exists "route loans read" on public.loans;
create policy "own loans read" on public.loans for select
  using (auth.uid() = user_id or public.is_admin());

-- installments
drop policy if exists "own inst read" on public.installments;
drop policy if exists "route inst read" on public.installments;
create policy "own inst read" on public.installments for select
  using (
    auth.uid() = (select l.user_id from public.loans l where l.id = installments.loan_id)
    or public.is_admin()
  );

-- loan_documents
drop policy if exists "loan docs read"  on public.loan_documents;
drop policy if exists "loan docs write" on public.loan_documents;
create policy "loan docs read" on public.loan_documents for select
  using (public.is_admin());
create policy "loan docs write" on public.loan_documents for all
  using (public.is_admin()) with check (public.is_admin());

-- storage: policy lama menyebut is_petugas() — buang lalu buat ulang admin-only
drop policy if exists "kyc insert own folder" on storage.objects;
drop policy if exists "kyc select own or admin" on storage.objects;
create policy "kyc admin all" on storage.objects for all
  using (bucket_id = 'kyc-documents' and public.is_admin())
  with check (bucket_id = 'kyc-documents' and public.is_admin());

-- ============================================================
-- 7b. Buang kolom penanda petugas (nilai lama sudah disalin ke
--     dicatat_oleh di bagian 1, dan policy dependen sudah dilepas)
-- ============================================================

alter table public.payments      drop column if exists petugas_id;
alter table public.loans         drop column if exists collected_by;
alter table public.installments  drop column if exists paid_by;
alter table public.profiles      drop column if exists petugas_id;
alter table public.profiles      drop column if exists wilayah;

-- ============================================================
-- 7c. Buang fungsi is_petugas() — harus SETELAH semua policy yang
--     memakainya dilepas, kalau tidak DROP FUNCTION gagal (2BP01)
-- ============================================================

drop function if exists public.is_petugas();

-- ============================================================
-- 8. RPC: hapus cek is_petugas()
--    Body di-copy verbatim dari schema.sql; hanya cek peran & nama kolom
--    (petugas_id/paid_by/collected_by -> dicatat_oleh) yang berubah.
-- ============================================================

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

create or replace function public.void_and_repay(p_payment_id uuid, p_reason text, p_correct_amount bigint, p_correct_note text)
returns void language plpgsql security definer set search_path = public as $$
declare pm record; v_remaining bigint;
begin
  if p_correct_amount is null or p_correct_amount <= 0 then
    raise exception 'Nominal yang benar harus lebih dari 0';
  end if;
  select * into pm from public.payments where id = p_payment_id;
  if pm.id is null then
    raise exception 'Transaksi tidak ditemukan';
  end if;
  if pm.amount <= 0 then
    raise exception 'Transaksi koreksi tidak dapat dikoreksi lagi';
  end if;
  if exists (select 1 from public.payments where void_of = pm.id) then
    raise exception 'Transaksi ini sudah pernah dikoreksi';
  end if;
  if pm.installment_id is null then
    raise exception 'Transaksi ini tidak terikat cicilan';
  end if;
  -- sisa setelah void (izin dicek di dalam void_payment/record_cash_payment)
  select (i.amount - coalesce(i.amount_paid, 0) + pm.amount) into v_remaining
  from public.installments i where i.id = pm.installment_id;
  if p_correct_amount > v_remaining then
    raise exception 'Nominal benar melebihi sisa cicilan setelah koreksi';
  end if;
  perform public.void_payment(p_payment_id, p_reason);
  perform public.record_cash_payment(pm.installment_id, p_correct_amount, coalesce(p_correct_note, ''));
end;
$$;

-- ============================================================
-- 9. Buang fungsi convert calon (fitur petugas)
-- ============================================================

drop function if exists public.convert_calon_internal(uuid, uuid, boolean);

-- ============================================================
-- 10. handle_new_user: default role nasabah (tidak berubah,
--     tapi dicatat eksplisit supaya tidak ada kebingungan)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, email, full_name, phone)
  values (new.id, 'nasabah',
          coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          coalesce(new.raw_user_meta_data->>'phone', ''));
  return new;
end;
$$;
