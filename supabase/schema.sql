-- ============================================================
-- SWFinance Lender Platform — Supabase schema + RLS
-- Jalankan SEKALI di Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. CUSTOM TYPES ------------------------------------------------
create type user_role   as enum ('admin', 'nasabah');  -- M21: petugas & borrower dihapus (aplikasi admin-only)
create type kyc_status  as enum ('pending', 'verified', 'rejected');
create type doc_type    as enum ('ktp', 'selfie');
create type loan_frequency as enum ('weekly', 'monthly');  -- v2.0 bank keliling
create type loan_status as enum ('disbursed', 'active', 'completed', 'rejected');  -- M23: alur approval dihapus

-- 2. PROFILES (1-1 dengan auth.users) ----------------------------
create type status_keandalan as enum ('LANCAR', 'PERINGATAN', 'MACET');  -- M23

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role  not null default 'nasabah',   -- M21: admin|nasabah (petugas dihapus)
  email       text       not null default '',  -- copy dari auth.users
  full_name   text       not null default '',  -- = nama sesuai KTP
  -- --- Data KTP (model koperasi: full KTP wajib) ---
  nik         text       default '',
  tempat_lahir text      default '',
  birth_date  date,                              -- = tgl lahir KTP
  jenis_kelamin text     default '' check (jenis_kelamin in ('', 'L', 'P')),
  gol_darah     text     default '',             -- v3.2: A|B|AB|O (sebaris JK di KTP)
  berlaku_hingga date,                           -- v3.2: masa berlaku KTP (null = SEUMUR HIDUP)
  address     text       default '',             -- = alamat (nama jalan/no)
  rt_rw       text       default '',
  kelurahan   text       default '',
  kecamatan   text       default '',
  kota        text       default '',
  provinsi    text       default '',
  agama       text       default '',
  status_kawin text      default '',
  pekerjaan   text       default '',
  kewarganegaraan text   default 'WNI',
  -- --- Kontak & penugasan ---
  phone       text       default '',             -- nomor utama (wajib, format ID)
  -- --- v3.0: alamat tinggal saat ini + alamat kantor + share location ---
  current_address text     default '',             -- alamat tinggal saat ini (boleh beda dari KTP)
  office_address  text     default '',             -- alamat kantor / tempat kerja
  home_lat   double precision,                     -- shareloc rumah (opsional)
  home_lng   double precision,
  office_lat double precision,                     -- shareloc kantor (opsional)
  office_lng double precision,
  kyc_status  kyc_status not null default 'pending',
  status_keandalan status_keandalan not null default 'LANCAR',  -- M23: LANCAR|PERINGATAN|MACET
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Kontak darurat (2 per nasabah: seq 1 & 2, nama+hubungan+nomor wajib)
create table public.emergency_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  seq        int not null check (seq in (1,2)),
  nama       text not null default '',
  hubungan   text not null default '',
  nomor      text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, seq)
);

-- Validator nomor HP Indonesia: 08… / 628… / +628…, 9–15 digit
create or replace function public.valid_id_phone(p text)
returns boolean language sql immutable as $$
  select p ~ '^(\+62|62|0)8[0-9]{7,12}$';
$$;

-- 3. KYC DOCUMENTS ------------------------------------------------
create table public.kyc_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  doc_type     doc_type not null,
  storage_path text not null,                   -- path di bucket 'kyc-documents'
  created_at   timestamptz not null default now()
);

-- 4. LOANS (v2.0: frequency + bunga 20% + tenor s/d 52 + late_fee + dicatat_oleh)
create table public.loans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount          bigint not null check (amount between 50000 and 20000000),  -- Rp50rb - Rp20jt
  tenor_months    int not null check (tenor_months between 1 and 52),  -- v2.0: jumlah periode (weekly s/d 52 / monthly s/d 12)
  frequency       loan_frequency not null default 'weekly',            -- v2.0: mingguan|bulanan
  interest_rate   numeric(5,2) not null default 20.00,  -- v3.0: flat 20%/periode
  requested_amount bigint,                                  -- v3.0: usulan nasabah (admin tentukan final saat approve)
  collateral_type text default '',                         -- v3.0: jenis jaminan (BPKB/sertifikat/dll)
  collateral_detail text default '',                       -- v3.0: detail jaminan
  monthly_payment bigint not null,   -- = cicilan per periode (nama kolom dipertahankan)
  late_fee        bigint not null default 0,           -- v2.0: denda (0 sampai ditentukan)
  dicatat_oleh    uuid references public.profiles(id) on delete set null,  -- M21: admin pencatat (dulu collected_by)
  purpose         text default '',
  status          loan_status not null default 'disbursed',  -- M23: langsung cair
  reject_reason   text,
  decided_by      uuid references public.profiles(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Guard insert (v3.0): tenor monthly 1|3, weekly 1-52; requested_amount tercatat;
-- amount final = requested (admin override saat approve); cicilan terbit dari amount.
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
create trigger loans_guard before insert on public.loans
  for each row execute function public.loans_guard_insert();

-- 5. INSTALLMENTS (v2.0: + amount_paid cicilan parsial; M21: dicatat_oleh) ---
create table public.installments (
  id         uuid primary key default gen_random_uuid(),
  loan_id    uuid not null references public.loans(id) on delete cascade,
  seq        int not null,
  due_date   date not null,
  amount     bigint not null,
  amount_paid bigint not null default 0,   -- v2.0: terkumpul (parsial)
  dicatat_oleh uuid references public.profiles(id) on delete set null,  -- M21: admin pencatat (dulu paid_by)
  status     text not null default 'unpaid' check (status in ('unpaid','paid','overdue')),
  paid_at    timestamptz,
  unique (loan_id, seq)
);

-- 6. NOTIFICATIONS ----------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text,
  type       text default 'info',   -- info | loan_status | reminder | tagihan | janji_bayar (v2.0)
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- 6b. PAYMENTS: buku kas digital — setiap setoran TUNAI (v2.0) --------------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  loan_id        uuid not null references public.loans(id) on delete cascade,
  installment_id uuid references public.installments(id) on delete set null,
  nasabah_id     uuid not null references public.profiles(id) on delete cascade,
  dicatat_oleh   uuid references public.profiles(id) on delete set null,  -- M21: admin pencatat (dulu petugas_id)
  amount         bigint not null check (amount <> 0),   -- v2.0: positif = setoran, negatif = koreksi (void)
  paid_at        timestamptz not null default now(),
  note           text default '',
  void_of        uuid references public.payments(id) on delete set null,  -- koreksi: menunjuk transaksi asal
  voided_at      timestamptz,                          -- diisi saat transaksi ini dikoreksi
  void_reason    text default '',
  created_at     timestamptz not null default now()
);
create index idx_pay_loan    on public.payments(loan_id);
create index idx_pay_dicatat on public.payments(dicatat_oleh, paid_at);
create index idx_pay_nasabah on public.payments(nasabah_id);
create index idx_pay_void    on public.payments(void_of) where void_of is not null;

-- 7. HELPER: apakah user admin ----------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 8. AUTO-CREATE profile saat user baru mendaftar (v2.0: default nasabah) -----
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
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 10. RPC: pembayaran TUNAI oleh admin (v2.0, FR-B6b; M21: admin-only) -------
-- v2.0-autoapply: kelebihan mengalir ke cicilan berikutnya (prioritas due terdekat).
-- Tiap aliran = 1 baris payments (audit 1:1). Total > sisa hutang = DITOLAK.
-- Pengganti pay_installment untuk bank keliling: catat payments + dukung parsial.
-- pay_installment lama dipertahankan untuk kompatibilitas admin web v1.0.
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
  -- M23: Arus Kas — uang masuk dari pembayaran nasabah
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

-- 10a. RPC: KOREKSI salah input via reversal beraudit (M-void) ------------------
-- Tidak ada UPDATE/DELETE kas: transaksi salah dipertahankan + dibuat lawan negatif.
-- Petugas: miliknya + hari yang sama. Admin: apa pun. Alasan WAJIB.
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

-- 10a2. RPC: koreksi + langsung catat benar ATOMIC (M-void2) ------------------
-- void_payment + record_cash_payment dalam 1 transaksi: gagal di mana pun = rollback total.
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

-- 9b. RPC v3.0: admin buatkan pinjaman langsung (nominal dari WA = final).
-- M23: alur approval DIHAPUS — pinjaman langsung disbursed + cicilan + kas keluar.
create or replace function public.admin_create_loan(p_user_id uuid, p_amount bigint, p_tenor int, p_frequency loan_frequency, p_purpose text default '', p_collateral_type text default '', p_collateral_detail text default '')
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

-- 9c. RPC v3.0: flag riwayat telat (pernah nunggak / bayar lewat due).
-- true = cicilan unpaid sudah lewat due ATAU paid_at > due_date.
create or replace function public.nasabah_telat_flag(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.installments i
    join public.loans l on l.id = i.loan_id
    where l.user_id = p_user_id
      and (i.due_date < (now() at time zone 'Asia/Jakarta')::date and i.status <> 'paid'
           or i.paid_at::date > i.due_date)
  );
$$;

-- 9d. TABEL v3.0: dokumen per pinjaman (foto jaminan + dokumen lain).
create table if not exists public.loan_documents (
  id           uuid primary key default gen_random_uuid(),
  loan_id      uuid not null references public.loans(id) on delete cascade,
  doc_type     text not null default 'jaminan',
  storage_path text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists idx_loan_docs_loan on public.loan_documents(loan_id);

-- 10b. RPC lama: tandai cicilan lunas (admin; dipertahankan utk admin web v1.0) --
-- FR-B6 + hardening: admin-first, id jelas, hanya untuk loan berjalan
create or replace function public.pay_installment(p_installment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ins record; v_loan_status loan_status; v_nasabah uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admin can mark installments as paid';
  end if;
  select * into ins from public.installments where id = p_installment_id for update;
  if ins.id is null then
    raise exception 'Cicilan tidak ditemukan';
  end if;
  if ins.status = 'paid' then return; end if;  -- idempotent
  select status into v_loan_status from public.loans where id = ins.loan_id;
  if v_loan_status is null then
    raise exception 'Data pinjaman tidak ditemukan';
  end if;
  -- cegah pay cicilan milik loan yang belum dicairkan / sudah final
  if v_loan_status not in ('disbursed','active') then
    raise exception 'Pinjaman tidak dalam status berjalan';
  end if;
  update public.installments
     set status='paid', amount_paid = ins.amount, paid_at=now(), dicatat_oleh=auth.uid()
   where id = p_installment_id;
  -- v2.0: catat juga ke payments agar rekap setoran konsisten dengan installments
  select user_id into v_nasabah from public.loans where id = ins.loan_id;
  insert into public.payments (loan_id, installment_id, nasabah_id, dicatat_oleh, amount, note)
  values (ins.loan_id, ins.id, v_nasabah, auth.uid(),
          ins.amount - coalesce(ins.amount_paid, 0), 'pelunasan via admin web');
  insert into public.notifications (user_id, title, body, type)
  values (v_nasabah, 'Cicilan Lunas', 'Pembayaran cicilan ke-' || ins.seq || ' sebesar Rp' || ins.amount || ' telah diterima. Terima kasih!', 'info');
  -- jika semua lunas, loan selesai
  if not exists (select 1 from public.installments where loan_id = ins.loan_id and status <> 'paid') then
    update public.loans set status='completed' where id = ins.loan_id;
  end if;
end;
$$;

-- 11. UPDATED_AT trigger --------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 12. RLS ------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.kyc_documents  enable row level security;
alter table public.loans          enable row level security;
alter table public.installments   enable row level security;
alter table public.notifications  enable row level security;

-- profiles: user lihat diri sendiri; admin lihat semua
-- (TANPA policy insert: profile hanya dibuat oleh trigger handle_new_user,
--  supaya user tidak bisa self-insert dengan role='admin')
create policy "own profile"  on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "update own"   on public.profiles for update using (auth.uid() = id or public.is_admin());

-- Guard: peminjam tidak boleh mengubah role / kyc_status sendiri (self-escalation)
create or replace function public.profiles_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                                  -- v13: service_role / job internal
  end if;
  if coalesce(current_setting('role', true), '') = 'service_role' then
    return new;
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role or new.kyc_status is distinct from old.kyc_status then
      raise exception 'Tidak diizinkan mengubah role/kyc_status sendiri';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard_update();

-- kyc_documents
create policy "own kyc read"   on public.kyc_documents for select using (auth.uid() = user_id or public.is_admin());
create policy "kyc write"      on public.kyc_documents for insert with check (auth.uid() = user_id or public.is_admin());  -- v3.2: admin boleh catat foto KTP nasabah
create policy "admin kyc upd"  on public.kyc_documents for delete using (public.is_admin());

-- emergency_contacts: pemilik kelola miliknya; admin baca (+hapus)
alter table public.emergency_contacts enable row level security;
create policy "own ec read"   on public.emergency_contacts for select using (auth.uid() = user_id or public.is_admin());
create policy "own ec write"  on public.emergency_contacts for insert with check (auth.uid() = user_id);
create policy "own ec upd"    on public.emergency_contacts for update using (auth.uid() = user_id);
create policy "own ec del"    on public.emergency_contacts for delete using (auth.uid() = user_id or public.is_admin());

-- loans: nasabah insert & baca miliknya; admin semua + update status;
create policy "own loans read"  on public.loans for select using (auth.uid() = user_id or public.is_admin());
create policy "admin loans upd" on public.loans for update using (public.is_admin());

-- installments: read-only utk nasabah miliknya; admin kelola;
create policy "own inst read"  on public.installments for select using (
  exists (select 1 from public.loans l where l.id = loan_id and (l.user_id = auth.uid() or public.is_admin()))
);
create policy "admin inst upd" on public.installments for update using (public.is_admin());

alter table public.payments enable row level security;
alter table public.loan_documents enable row level security;   -- v3.0
create policy "pay read" on public.payments for select
  using (auth.uid() = nasabah_id or public.is_admin());
create policy "pay write" on public.payments for insert
  with check (public.is_admin());

-- loan_documents v3.0: pemilik baca miliknya; admin kelola
create policy "loan docs read" on public.loan_documents for select
  using (public.is_admin()
    or exists (select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid()));
create policy "loan docs write" on public.loan_documents for insert
  with check (public.is_admin()
    or exists (select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid()));

-- notifications
create policy "own notif read" on public.notifications for select using (auth.uid() = user_id or public.is_admin());
create policy "own notif upd"  on public.notifications for update using (auth.uid() = user_id);

-- 13. INDEX ------------------------------------------------------------------
create index idx_loans_user      on public.loans(user_id);
create index idx_loans_status    on public.loans(status);
create index idx_inst_loan       on public.installments(loan_id);
create index idx_notif_user      on public.notifications(user_id, is_read);
create index idx_kyc_user        on public.kyc_documents(user_id);
create index if not exists idx_inst_due on public.installments(due_date, status)
  where status in ('unpaid', 'overdue');   -- v13: pemindaian overdue harian

-- ============================================================
-- M23. ARUS KAS — buku mutasi kas masuk & keluar
--      (pencairan, pembayaran nasabah, modal owner, operasional)
-- ============================================================
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

-- M23b. Status keandalan nasabah: LANCAR | PERINGATAN | MACET
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

-- M23c. RPC ringkasan Arus Kas per hari (WIB)
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

-- ============================================================
-- 12b. v13 — OVERDUE OTOMATIS + CONVERT CALON 1-KLIK
--      (patch live: supabase/m13_convert_overdue.sql)
-- ============================================================
create extension if not exists pg_cron;

create or replace function public.mark_overdue_installments()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_count int := 0;
  r record;
begin
  for r in
    select i.id, i.seq, i.due_date,
           i.amount - coalesce(i.amount_paid, 0) as sisa,
           l.user_id
      from public.installments i
      join public.loans l on l.id = i.loan_id
     where l.status in ('disbursed', 'active')
       and i.status = 'unpaid'
       and i.due_date < v_today
  loop
    update public.installments set status = 'overdue' where id = r.id;
    insert into public.notifications (user_id, title, body, type)
    values (r.user_id,
            'Tagihan Terlambat',
            'Cicilan #' || r.seq || ' sebesar Rp' || r.sisa ||
            ' sudah lewat jatuh tempo (' || to_char(r.due_date, 'DD-MM-YYYY') ||
            '). Mohon segera dibayar.',
            'tagihan');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.mark_overdue_installments() from public, anon, authenticated;

-- 00:00 WIB = 17:00 UTC hari sebelumnya
select cron.schedule('danaku-mark-overdue', '0 17 * * *',
                     'select public.mark_overdue_installments();');

-- 14. SETELAH INI, jalankan manual di Dashboard:
--   a. Storage > New bucket: name = 'kyc-documents', PRIVATE bucket.
--   b. Storage > Policies > New policy > custom (SQL) pada bucket kyc-documents:
--        INSERT: (bucket_id = 'kyc-documents'::text) AND (auth.uid()::text = (storage.foldername(name))[1])
--        SELECT: (bucket_id = 'kyc-documents'::text) AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
--   c. Promote akun admin pertama (ganti UUID-nya dari tabel auth.users):
--        update public.profiles set role='admin' where id = 'UUID-ANDA';
-- ============================================================
