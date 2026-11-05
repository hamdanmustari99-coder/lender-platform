-- ============================================================
-- M24: Kartu Nasabah & Jaminan — lengkapi output list_nasabah()
--
-- Mockup acuan menampilkan tiap nasabah sebagai kartu kaya:
-- foto, NIK, WA, alamat rumah + link Maps, alamat kantor + link
-- Maps, agunan/jaminan yang ditahan, jumlah pinjaman aktif,
-- dan badge status keandalan (LANCAR/PERINGATAN/MACET).
--
-- Sebelumnya list_nasabah() hanya mengembalikan 10 kolom dasar,
-- sehingga UI terpaksa pakai tabel — informasi terlalu tipis.
--
-- Kontrak BARU per baris (semua field lama tetap ada):
--   id, full_name, phone, nik, foto_path, created_at,
--   role, kyc_status, telat, status_keandalan,
--   alamat_rumah, home_lat, home_lng,
--   alamat_kantor, office_lat, office_lng,
--   pinjaman_aktif, jaminan[]  (jsonb: tipe, detail, status)
-- ============================================================

create or replace function public.list_nasabah(
  p_page int default 1,
  p_page_size int default 50,
  p_search text default null,
  p_role text default null,
  p_kyc text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size  int := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_off   int := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 200);
begin
  if not public.is_admin() then
    raise exception 'Only admin can list nasabah';
  end if;

  return (
    with filtered as (
      select p.*
        from public.profiles p
       where (p_search is null
              or p.full_name ilike '%' || p_search || '%'
              or p.phone    ilike '%' || p_search || '%'
              or p.nik      ilike '%' || p_search || '%')
         and (p_role is null or p.role::text = p_role)
         and (p_kyc  is null or p.kyc_status::text = p_kyc)
    ),
    page as (
      select * from filtered
       order by created_at desc
       limit v_size offset v_off
    ),
    telat as (
      select distinct l.user_id
        from public.installments i
        join public.loans l on l.id = i.loan_id
       where i.status in ('unpaid', 'overdue')
         and i.due_date < (now() at time zone 'Asia/Jakarta')::date
    ),
    -- pinjaman berjalan + agunannya, diagregasi sekali untuk halaman ini
    aktif as (
      select l.user_id,
             count(*)::int as jumlah,
             jsonb_agg(
               jsonb_build_object(
                 'tipe',   coalesce(nullif(btrim(l.collateral_type), ''),  'Tidak dicatat'),
                 'detail', coalesce(btrim(l.collateral_detail), ''),
                 'status', l.status::text
               ) order by l.created_at desc
             ) as jaminan
        from public.loans l
       where l.status in ('disbursed', 'active')
         and l.user_id in (select id from page)
       group by l.user_id
    )
    select json_build_object(
      'total', (select count(*) from filtered),
      'page', greatest(coalesce(p_page, 1), 1),
      'pageSize', v_size,
      'rows', (select coalesce(json_agg(row_to_json(pg) order by pg.created_at desc), '[]'::json)
                 from (select pg.id,
                              pg.full_name,
                              pg.phone,
                              pg.nik,
                              pg.foto_path,
                              pg.created_at,
                              pg.role,
                              pg.kyc_status,
                              (t.user_id is not null) as telat,
                              pg.status_keandalan,
                              pg.current_address as alamat_rumah,
                              pg.home_lat,
                              pg.home_lng,
                              pg.office_address as alamat_kantor,
                              pg.office_lat,
                              pg.office_lng,
                              coalesce(a.jumlah, 0) as pinjaman_aktif,
                              coalesce(a.jaminan, '[]'::jsonb) as jaminan
                         from page pg
                         left join telat  t on t.user_id = pg.id
                         left join aktif  a on a.user_id  = pg.id) pg)
    )
  );
end;
$$;
