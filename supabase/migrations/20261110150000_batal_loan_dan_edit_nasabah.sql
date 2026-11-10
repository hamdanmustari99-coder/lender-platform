-- ============================================================
-- Fitur baru (request operator):
--   1. admin_batal_loan    : batal/hapus pinjaman yang belum ada pembayaran valid
--   2. admin_update_nasabah: edit data profil nasabah (NIK/role/kyc terkunci)
-- ============================================================

-- 1) BATAL/HAPUS PINJAMAN ----------------------------------------------------
-- Aturan ketat: hanya pinjaman disbursed/active yang BELUM punya pembayaran valid
-- (payments dengan voided_at null dan void_of null) boleh dibatalkan.
-- Semua jejak dihapus bersih (payments, cash_transactions, installments, loans)
-- supaya arus kas tidak menghitung pencairan pinjaman yang batal.
-- Catatan: voided/void_payment rows ikut terhapus — net-nya nol terhadap kas.
create or replace function public.admin_batal_loan(p_loan_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid;
  v_status loan_status;
  v_valid_pay int;
begin
  if not public.is_admin() then
    raise exception 'Only admin can cancel loans';
  end if;

  select user_id, status into v_user, v_status
    from public.loans where id = p_loan_id;
  if v_user is null then
    raise exception 'Pinjaman tidak ditemukan';
  end if;
  if v_status not in ('disbursed', 'active') then
    raise exception 'Pinjaman dengan status % tidak bisa dibatalkan', v_status;
  end if;

  select count(*) into v_valid_pay
    from public.payments
   where loan_id = p_loan_id
     and voided_at is null
     and void_of is null;
  if v_valid_pay > 0 then
    raise exception 'Pinjaman sudah memiliki % pembayaran — batalkan dulu pembayarannya lewat menu Revisi', v_valid_pay;
  end if;

  delete from public.cash_transactions where loan_id = p_loan_id;
  delete from public.loans where id = p_loan_id;  -- payments & installments cascade
end;
$$;

-- 2) EDIT DATA NASABAH -------------------------------------------------------
-- Whitelist field KTP/kontak/alamat. NIK, role, kyc_status, email TIDAK bisa
-- diubah dari sini (NIK dipakai dedupe + email dummy auth.users terikat NIK).
-- Aturan update per-field: hanya field yang ADA di p_data yang berubah;
-- string kosong => null (mapping kolom nullable), full_name tidak boleh jadi kosong.
create or replace function public.admin_update_nasabah(p_user_id uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role user_role;
begin
  if not public.is_admin() then
    raise exception 'Only admin can edit nasabah';
  end if;
  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'Profil tidak ditemukan';
  end if;
  if v_role <> 'nasabah' then
    raise exception 'Hanya data nasabah yang bisa diedit lewat fungsi ini';
  end if;

  update public.profiles p set
    full_name         = case when p_data ? 'full_name'
                             then coalesce(nullif(trim(p_data->>'full_name'), ''), p.full_name)
                             else p.full_name end,
    phone             = case when p_data ? 'phone'             then nullif(p_data->>'phone', '')             else p.phone end,
    tempat_lahir      = case when p_data ? 'tempat_lahir'      then nullif(p_data->>'tempat_lahir', '')      else p.tempat_lahir end,
    birth_date        = case when p_data ? 'birth_date'        then nullif(p_data->>'birth_date', '')::date  else p.birth_date end,
    jenis_kelamin     = case when p_data ? 'jenis_kelamin'     then nullif(p_data->>'jenis_kelamin', '')     else p.jenis_kelamin end,
    address           = case when p_data ? 'address'           then nullif(p_data->>'address', '')           else p.address end,
    current_address   = case when p_data ? 'current_address'   then nullif(p_data->>'current_address', '')   else p.current_address end,
    office_address    = case when p_data ? 'office_address'    then nullif(p_data->>'office_address', '')    else p.office_address end,
    rt_rw             = case when p_data ? 'rt_rw'             then nullif(p_data->>'rt_rw', '')             else p.rt_rw end,
    kelurahan         = case when p_data ? 'kelurahan'         then nullif(p_data->>'kelurahan', '')         else p.kelurahan end,
    kecamatan         = case when p_data ? 'kecamatan'         then nullif(p_data->>'kecamatan', '')         else p.kecamatan end,
    kota              = case when p_data ? 'kota'              then nullif(p_data->>'kota', '')              else p.kota end,
    provinsi          = case when p_data ? 'provinsi'          then nullif(p_data->>'provinsi', '')          else p.provinsi end,
    agama             = case when p_data ? 'agama'             then nullif(p_data->>'agama', '')             else p.agama end,
    status_kawin      = case when p_data ? 'status_kawin'      then nullif(p_data->>'status_kawin', '')      else p.status_kawin end,
    pekerjaan         = case when p_data ? 'pekerjaan'         then nullif(p_data->>'pekerjaan', '')         else p.pekerjaan end,
    kewarganegaraan   = case when p_data ? 'kewarganegaraan'   then nullif(p_data->>'kewarganegaraan', '')   else p.kewarganegaraan end,
    updated_at        = now()
  where p.id = p_user_id;

  if p_data ? 'phone' and coalesce(p_data->>'phone', '') <> '' then
    if not public.valid_id_phone(p_data->>'phone') then
      raise exception 'Format nomor HP tidak valid';
    end if;
  end if;
end;
$$;
