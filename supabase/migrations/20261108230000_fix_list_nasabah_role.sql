-- Fix: list_nasabah ikut mengembalikan akun admin/owner.
--
-- Akar masalah: filter hanya memakai `p_role` opsional yang TIDAK pernah diisi
-- pemanggil. UI Users.tsx dan Dashboard.tsx memanggil list_nasabah tanpa p_role,
-- sehingga SEMUA profil (termasuk admin) masuk hasil:
--   1. Halaman "Daftar Nasabah" menampilkan akun admin lengkap dengan tombol
--      hapus -> operator bisa menghapus akunnya sendiri.
--   2. Card "TOTAL NASABAH TERDAFTAR" di dashboard kelebihan 1 (menghitung admin).
--
-- Perbaikan: kunci daftar ke role 'nasabah' di dalam RPC, bukan bergantung pada
-- argumen yang bisa lupa diisi. p_role tetap dipertahankan agar kompatibel.
--
-- Diverifikasi setelah diterapkan: list_nasabah({}) mengembalikan 0 dengan data
-- kosong, padahal akun admin tetap ada (login tetap jalan).

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
         -- Hanya akun berperan 'nasabah'. Akun admin/owner TIDAK boleh
         -- pernah muncul di daftar nasabah: dulu ikut tampil sehingga bisa
         -- terhapus lewat tombol hapus dan mengunci platform (dan membuat
         -- hitungan 'nasabah terdaftar' di dashboard kelebihan 1).
         and p.role = 'nasabah'
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
    -- pinjaman berjalan + nominalnya, diagregasi sekali untuk halaman ini
    aktif as (
      select l.user_id,
             count(*)::int as jumlah,
             coalesce(sum(l.amount), 0)::bigint as total_dipinjam,
             coalesce(sum(coalesce(t.tagihan, 0)), 0)::bigint as total_tagihan,
             coalesce(sum(greatest(coalesce(t.tagihan, 0) - coalesce(t.dibayar, 0), 0)), 0)::bigint as total_sisa,
             coalesce(sum(coalesce(t.dibayar, 0)), 0)::bigint as total_dibayar,
             jsonb_agg(
               jsonb_build_object(
                 'id',        l.id,
                 'pokok',     l.amount,
                 'tagihan',   coalesce(t.tagihan, 0),
                 'sisa',      greatest(coalesce(t.tagihan, 0) - coalesce(t.dibayar, 0), 0),
                 'dibayar',   coalesce(t.dibayar, 0),
                 'frekuensi', l.frequency::text,
                 'tenor',     l.tenor_months,
                 'tanggal',   l.created_at,
                 'status',    l.status::text,
                 'tipe',      coalesce(nullif(btrim(l.collateral_type), ''),  'Tidak dicatat'),
                 'detail',    coalesce(btrim(l.collateral_detail), '')
               ) order by l.created_at desc
             ) as pinjaman_detail
        from public.loans l
        left join lateral (
          select sum(i.amount)      as tagihan,
                 sum(i.amount_paid) as dibayar
            from public.installments i
           where i.loan_id = l.id
        ) t on true
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
                              coalesce(a.jumlah, 0)            as pinjaman_aktif,
                              coalesce(a.pinjaman_detail, '[]'::jsonb) as pinjaman_detail,
                              coalesce(a.total_dipinjam, 0)    as total_dipinjam,
                              coalesce(a.total_tagihan, 0)     as total_tagihan,
                              coalesce(a.total_sisa, 0)        as total_sisa,
                              coalesce(a.total_dibayar, 0)     as total_dibayar
                         from page pg
                         left join telat  t on t.user_id = pg.id
                         left join aktif  a on a.user_id  = pg.id) pg)
    )
  );
end;
$$;
