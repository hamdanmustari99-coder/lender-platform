-- ============================================================
-- M22: RPC M20 ikut menyesuaikan kolom petugas_id -> dicatat_oleh
--      (M21 menghapus kolom petugas_id, payments.loans.installments.profiles)
--
-- Tanpa migrasi ini, list_nasabah() & setoran_harian() error:
--   "column pg.petugas_id does not exist" / "column pm.petugas_id does not exist"
-- ============================================================

-- ---------- list_nasabah: buang pg.petugas_id dari output ----------
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
    )
    select json_build_object(
      'total', (select count(*) from filtered),
      'page', greatest(coalesce(p_page, 1), 1),
      'pageSize', v_size,
      'rows', (select coalesce(json_agg(row_to_json(pg) order by pg.created_at desc), '[]'::json)
                 from (select pg.id, pg.full_name, pg.email, pg.phone, pg.nik,
                              pg.role, pg.kyc_status, pg.foto_path,
                              pg.created_at,
                              (t.user_id is not null) as telat
                         from page pg
                         left join telat t on t.user_id = pg.id) pg)
    )
  );
end;
$$;

-- ---------- setoran_harian: pm.petugas_id -> pm.dicatat_oleh ----------
create or replace function public.setoran_harian(
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
    raise exception 'Only admin can list setoran';
  end if;

  return (
    with agg as (
      select
        (pm.paid_at at time zone 'Asia/Jakarta')::date as tanggal,
        pm.dicatat_oleh,
        coalesce(p.full_name, pm.dicatat_oleh::text) as pencatat_nama,
        coalesce(sum(pm.amount), 0)::bigint as total,
        count(*)::int as jumlah
        from public.payments pm
        left join public.profiles p on p.id = pm.dicatat_oleh
       where pm.void_of is null
         and (p_dari is null or (pm.paid_at at time zone 'Asia/Jakarta')::date >= p_dari)
         and (p_sampai is null or (pm.paid_at at time zone 'Asia/Jakarta')::date <= p_sampai)
       group by 1, 2, 3
    )
    select json_build_object(
      'total', (select count(*) from agg),
      'page', greatest(coalesce(p_page, 1), 1),
      'pageSize', v_size,
      'rows', (select coalesce(json_agg(r order by r.tanggal desc, r.total desc), '[]'::json)
                 from (select tanggal, dicatat_oleh as "pencatatId",
                              pencatat_nama as "pencatatNama", total, jumlah
                         from agg
                        order by tanggal desc, total desc
                        limit v_size
                        offset v_offset) r)
    )
  );
end;
$$;
