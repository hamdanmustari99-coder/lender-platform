-- ============================================================
-- Fix setoran_harian: koreksi pembayaran dihitung sebagai
-- tambahan uang masuk.
--
-- void_payment membatalkan baris ASLI (set voided_at) dan
-- memasukkan baris REVERSAL negatif (void_of = id asli).
-- Agregasi lama hanya membuang baris reversal (`void_of is null`),
-- sehingga baris asli yang sudah dibatalkan TETAP ikut dijumlah —
-- nominal koreksi muncul sebagai "tambahan" di Total Tunai.
--
-- Bukti data live (per hari, WIB):
--   2026-11-06  lama 11.710.000 -> benar 5.710.000
--   2026-11-05  lama  6.000.000 -> benar         0
--
-- Fix: buang juga baris asli yang sudah dibatalkan
-- (`pm.voided_at is null`). count(*) ikut menghitung hanya
-- transaksi yang masih sah.
-- ============================================================

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
         and pm.voided_at is null
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
