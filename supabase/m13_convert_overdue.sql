-- ============================================================
-- M13 PATCH — Convert calon 1-klik + Overdue otomatis
-- Jalankan pada DB LIVE: `supabase db query --linked -f supabase/m13_convert_overdue.sql`
-- Blok yang sama ditambahkan ke `supabase/schema.sql` (bootstrap fresh).
-- Idempoten: aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1. GUARD PROFILES — escape hatch server-side
--    Convert calon perlu menulis kyc_status='verified' atas nama akun lain.
--    Guard tetap menolak end-user (auth.uid() terisi) yang mencoba mengubah
--    role/kyc_status sendiri. Panggilan server (service_role / tanpa JWT)
--    lolos; RLS tetap gerbang luar.
-- ------------------------------------------------------------
create or replace function public.profiles_guard_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                                  -- service_role / job internal
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

-- ------------------------------------------------------------
-- 2. OVERDUE OTOMATIS (roadmap #2)
--    Tanggal acuan = Asia/Jakarta (server TZ = UTC, WIB = UTC+7).
--    Transisi unpaid -> overdue = 1 notifikasi 'tagihan', sekali saja.
-- ------------------------------------------------------------
create index if not exists idx_inst_due
  on public.installments(due_date, status)
  where status in ('unpaid', 'overdue');

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

-- Hanya server yang memicu (job cron jalan sebagai postgres).
revoke all on function public.mark_overdue_installments() from public, anon, authenticated;

-- Jadwal harian 00:00 WIB = 17:00 UTC hari sebelumnya.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'danaku-mark-overdue') then
    perform cron.unschedule('danaku-mark-overdue');
  end if;
  perform cron.schedule('danaku-mark-overdue', '0 17 * * *',
                        'select public.mark_overdue_installments();');
end $$;

-- void_payment: koreksi jangan menghapus tunggakan — status kembali 'overdue'
-- bila cicilan memang sudah lewat jatuh tempo.
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pm record; v_reason text; v_is_admin boolean;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
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
  v_is_admin := public.is_admin();
  if not v_is_admin then
    if not public.is_petugas() then
      raise exception 'Hanya petugas atau admin yang dapat mengoreksi';
    end if;
    if pm.petugas_id is distinct from auth.uid() then
      raise exception 'Petugas hanya dapat mengoreksi transaksi miliknya sendiri';
    end if;
    if pm.paid_at::date <> v_today then
      raise exception 'Koreksi mandiri hanya untuk transaksi hari ini. Hubungi owner.';
    end if;
  end if;
  insert into public.payments (loan_id, installment_id, nasabah_id, petugas_id, amount, note, void_of, void_reason)
  values (pm.loan_id, pm.installment_id, pm.nasabah_id, auth.uid(),
          -pm.amount, 'KOREKSI: ' || v_reason, pm.id, v_reason);
  update public.payments set voided_at = now(), void_reason = v_reason where id = pm.id;
  if pm.installment_id is not null then
    update public.installments
       set amount_paid = greatest(0, coalesce(amount_paid,0) - pm.amount)
     where id = pm.installment_id;
    update public.installments
       set status = case when amount_paid >= amount then 'paid'
                         when due_date < v_today then 'overdue'
                         else 'unpaid' end,
           paid_at = case when amount_paid >= amount then paid_at else null end
     where id = pm.installment_id;
  end if;
  update public.loans
     set status = case when status = 'completed'
                       and exists (select 1 from public.installments
                                   where loan_id = pm.loan_id and status <> 'paid')
                       then 'active' else status end
   where id = pm.loan_id;
  insert into public.notifications (user_id, title, body, type)
  select l.user_id, 'Koreksi Pembayaran',
         'Terdapat koreksi pencatatan pembayaran sebesar Rp' || pm.amount ||
         '. Alasan: ' || v_reason || '. Sisa hutang Anda telah disesuaikan.', 'info'
  from public.loans l where l.id = pm.loan_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. CONVERT CALON 1-KLIK (roadmap #1)
--    Akun auth dibuat Edge Function (service_role); fungsi ini mengurus DB:
--    isi profil dari data lapangan, auto-assign rute, tutup baris calon,
--    notifikasi ke nasabah. REVOKE dari anon/authenticated.
-- ------------------------------------------------------------
create or replace function public.convert_calon_internal(
  p_calon_id uuid,
  p_user_id uuid,
  p_assign_route boolean default true
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_route boolean := false;
  v_conflict uuid;
begin
  select * into c from public.calon_nasabah where id = p_calon_id for update;
  if c.id is null then
    raise exception 'Calon tidak ditemukan';
  end if;
  if c.status = 'jadi_nasabah' then
    raise exception 'Calon ini sudah dikonversi jadi nasabah';
  end if;
  if c.status = 'ditolak' then
    raise exception 'Calon ini sudah ditolak — ubah status ke "diproses" dulu';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profil akun hasil convert tidak ditemukan';
  end if;

  -- NIK tidak boleh dobel antar nasabah.
  if nullif(btrim(c.nik), '') is not null then
    select id into v_conflict from public.profiles
     where nik = btrim(c.nik) and id <> p_user_id limit 1;
    if v_conflict is not null then
      raise exception 'NIK % sudah dipakai nasabah lain', c.nik;
    end if;
  end if;

  -- Profil: isi yang kosong dari data lapangan; jangan timpa data lebih lengkap.
  update public.profiles set
    full_name       = coalesce(nullif(btrim(full_name), ''), nullif(c.nama, '')),
    nik             = coalesce(nullif(btrim(nik), ''), nullif(btrim(c.nik), '')),
    phone           = coalesce(nullif(btrim(phone), ''), nullif(btrim(c.phone), '')),
    address         = coalesce(nullif(btrim(address), ''), nullif(btrim(c.alamat), '')),
    current_address = coalesce(nullif(btrim(current_address), ''), nullif(btrim(c.alamat), '')),
    wilayah         = coalesce(nullif(btrim(wilayah), ''), nullif(c.wilayah, '')),
    petugas_id      = coalesce(petugas_id, c.petugas_id),
    kyc_status      = 'verified'
  where id = p_user_id;

  -- Auto-assign rute: nasabah baru langsung masuk daftar tagihan petugas pendaftar.
  if p_assign_route and c.petugas_id is not null then
    insert into public.collection_routes (petugas_id, nasabah_id, wilayah, aktif)
    values (c.petugas_id, p_user_id, coalesce(c.wilayah, ''), true)
    on conflict (petugas_id, nasabah_id)
      do update set aktif = true, wilayah = excluded.wilayah;
    v_route := true;
  end if;

  update public.calon_nasabah
     set status = 'jadi_nasabah',
         converted_user_id = p_user_id,
         owner_note = case when coalesce(btrim(owner_note), '') = ''
                           then 'Convert 1-klik ' ||
                                to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI')
                           else owner_note end
   where id = p_calon_id;

  insert into public.notifications (user_id, title, body, type)
  values (p_user_id, 'Akun Nasabah Aktif',
          'Pendaftaran Anda telah diproses. Silakan hubungi petugas untuk pengajuan pinjaman.',
          'info');

  return jsonb_build_object(
    'user_id', p_user_id,
    'calon_id', p_calon_id,
    'route_assigned', v_route,
    'petugas_id', c.petugas_id
  );
end;
$$;

revoke all on function public.convert_calon_internal(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.convert_calon_internal(uuid, uuid, boolean) to service_role;
