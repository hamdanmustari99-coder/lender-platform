-- ============================================================
-- M25: Nominal pinjaman per nasabah (kartu Nasabah)
--
-- Permintaan klien: "si nasabah ini lagi punya berapa pinjaman
-- ke owner" — kartu M24 cuma menampilkan JUMLAH pinjaman aktif
-- (mis. "2 Pinjaman Aktif"), tanpa nominal. Owner perlu tahu
-- berapa uang yang sedang keluar dan berapa yang masih harus
-- ditagih, langsung dari kartu tanpa buka halaman detail.
--
-- Kontrak BARU per baris (semua field M24 tetap ada):
--   pinjaman_aktif, pinjaman_detail[], total_dipinjam,
--   total_tagihan, total_sisa, total_dibayar
--
--   pinjaman_detail[] = {
--     id, pokok, tagihan, sisa, dibayar, frekuensi, tenor,
--     tanggal, status, tipe, detail
--   }
--
--   pokok   = loans.amount (modal yang cair ke nasabah)
--   tagihan = total semua cicilan (pokok + bunga flat)
--   sisa    = tagihan - terkumpul (yang masih harus ditagih)
--   dibayar = terkumpul dari cicilan parsial
--
-- Catatan: jaminan TIDAK lagi jadi array terpisah — tiap entri
-- pinjaman_detail membawa tipe + detail agunannya, dan frontend
-- menampilkannya di blok "Agunan / Jaminan Ditahan".
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
