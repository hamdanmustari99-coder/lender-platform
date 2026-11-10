-- Lanjutan edit nasabah: koordinat shareloc (rumah & kantor) boleh di-update admin.
-- Lat/lng hanya berubah kalau key-nya ada di p_data; null di JSON = hapus pin.
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
    home_lat          = case when p_data ? 'home_lat'          then (p_data->>'home_lat')::double precision  else p.home_lat end,
    home_lng          = case when p_data ? 'home_lng'          then (p_data->>'home_lng')::double precision  else p.home_lng end,
    office_lat        = case when p_data ? 'office_lat'        then (p_data->>'office_lat')::double precision else p.office_lat end,
    office_lng        = case when p_data ? 'office_lng'        then (p_data->>'office_lng')::double precision else p.office_lng end,
    updated_at        = now()
  where p.id = p_user_id;

  if p_data ? 'phone' and coalesce(p_data->>'phone', '') <> '' then
    if not public.valid_id_phone(p_data->>'phone') then
      raise exception 'Format nomor HP tidak valid';
    end if;
  end if;
end;
$$;
