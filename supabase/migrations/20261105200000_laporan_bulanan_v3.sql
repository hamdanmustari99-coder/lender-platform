-- ============================================================
-- M26d: laporan_bulanan v3 — pencairan kecuali pinjaman rejected
--
-- Masalah di v2: 'pencairan' & 'pinjaman_baru' menjumlahkan SEMUA
-- pinjaman yang dibuat dalam periode, termasuk yang berstatus
-- 'rejected'. Pinjaman ditolak tidak pernah cair, jadi tidak
-- menimbulkan kas keluar — menghitungnya membuat angka pencairan
-- tidak cocok dengan arus kas (selisih 3,75 jt pada data Nov 2026:
-- 17 pinjaman dibuat, 3 di antaranya rejected).
--
-- Perbaikan: tambah filter status <> 'rejected' pada pencairan,
-- pinjaman_baru, dan tren.pencairan.
-- ============================================================

-- ============================================================
-- M26c: laporan_bulanan v2 — pisahkan koreksi dari terkumpul
--
-- Masalah di v1: "terkumpul" menjumlahkan SEMUA baris kas MASUK
-- bertipe pembayaran, termasuk pembayaran yang kemudian di-void
-- (koreksi). Karena backfill M26b menuliskan pembayaran asli
-- sebagai MASUK dan pembatalannya sebagai KELUAR 'Koreksi
-- Pembayaran', angka "terkumpul" v1 jadi overstated — uang yang
-- sudah dikembalikan ke nasabah tetap dihitung sebagai pemasukan.
--
-- Perbaikan: tambah 2 field di ringkasan:
--   * koreksi           — total KELUAR 'Koreksi Pembayaran' periode ini
--   * terkumpul_bersih  — terkumpul - koreksi (uang yang benar-benar ditahan)
-- dan pakai terkumpul_bersih untuk kolektibilitas.
--
-- Field lama tetap ada supaya consumer existing tidak pecah.
-- ============================================================

create or replace function public.laporan_bulanan(
  p_bulan int default null,
  p_tahun int default null
)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_bulan int;
  v_tahun int;
  v_dari   date;
  v_sampai date;
begin
  if not public.is_admin() then
    raise exception 'Only admin can view laporan';
  end if;

  v_bulan := least(greatest(coalesce(p_bulan,
                 extract(month from (now() at time zone 'Asia/Jakarta'))::int), 1), 12);
  v_tahun := coalesce(p_tahun,
                 extract(year from (now() at time zone 'Asia/Jakarta'))::int);
  v_dari   := make_date(v_tahun, v_bulan, 1);
  v_sampai := (v_dari + interval '1 month - 1 day')::date;

  return (
    with
    batas as (
      select v_dari  as dari,
             v_sampai as sampai,
             (v_dari::timestamp   at time zone 'Asia/Jakarta') as ts_dari,
             ((v_sampai + 1)::timestamp at time zone 'Asia/Jakarta') as ts_sampai
    ),
    periode as (
      select json_build_object(
        'bulan', v_bulan,
        'tahun', v_tahun,
        'nama_bulan', to_char(v_dari, 'TMMonth'),
        'dari', v_dari,
        'sampai', v_sampai,
        'jumlah_hari', (v_sampai - v_dari + 1),
        'hari_berjalan', case
          when (now() at time zone 'Asia/Jakarta')::date between v_dari and v_sampai
            then ((now() at time zone 'Asia/Jakarta')::date - v_dari + 1)
          when (now() at time zone 'Asia/Jakarta')::date > v_sampai
            then (v_sampai - v_dari + 1)
          else 0 end,
        'sudah_lewat', ((now() at time zone 'Asia/Jakarta')::date > v_sampai)
      ) as j
    ),
    loan_agg as (
      select l.id,
             l.user_id,
             l.amount                                        as pokok,
             coalesce(sum(i.amount), 0)::bigint              as tagihan,
             greatest(coalesce(sum(i.amount), 0) - l.amount, 0)::bigint as bunga,
             coalesce(sum(i.amount_paid), 0)::bigint         as dibayar,
             greatest(coalesce(sum(i.amount), 0) - coalesce(sum(i.amount_paid), 0), 0)::bigint as sisa
        from public.loans l
        left join public.installments i on i.loan_id = l.id
       where l.status in ('disbursed', 'active')
       group by l.id, l.user_id, l.amount
    ),
    ringkasan as (
      select json_build_object(
        'pencairan', (
          select coalesce(sum(l.amount), 0)::bigint
            from public.loans l, batas b
           where l.created_at >= b.ts_dari and l.created_at < b.ts_sampai
             and l.status <> 'rejected'
        ),
        'pinjaman_baru', (
          select count(*)::int
            from public.loans l, batas b
           where l.created_at >= b.ts_dari and l.created_at < b.ts_sampai
             and l.status <> 'rejected'
        ),
        'nasabah_baru', (
          select count(*)::int
            from public.profiles p, batas b
           where p.role = 'nasabah'
             and p.created_at >= b.ts_dari and p.created_at < b.ts_sampai
        ),
        'jatuh_tempo', (
          select coalesce(sum(i.amount), 0)::bigint
            from public.installments i, batas b
           where i.due_date >= b.dari and i.due_date <= b.sampai
        ),
        'terkumpul', (
          select coalesce(sum(c.nominal), 0)::bigint
            from public.cash_transactions c, batas b
           where c.tipe = 'MASUK'
             and c.kategori = 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        ),
        -- M26c: pembayaran yang dibatalkan/dikoreksi (uang kembali ke nasabah)
        'koreksi', (
          select coalesce(sum(c.nominal), 0)::bigint
            from public.cash_transactions c, batas b
           where c.tipe = 'KELUAR'
             and c.kategori = 'Koreksi Pembayaran'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        ),
        -- laba bunga = porsi bunga dari tiap pembayaran yang masuk periode ini
        'laba_bunga', (
          select coalesce(sum(round(c.nominal *
                 (la.bunga::numeric / nullif(la.tagihan, 0)))), 0)::bigint
            from public.cash_transactions c
            join loan_agg la on la.id = c.loan_id
            cross join batas b
           where c.tipe = 'MASUK'
             and c.kategori = 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        ),
        'sisa_piutang', (select coalesce(sum(sisa), 0)::bigint from loan_agg),
        'total_modal',  (select coalesce(sum(pokok), 0)::bigint from loan_agg),
        'pinjaman_berjalan', (select count(*)::int from loan_agg),
        'nasabah_aktif', (
          select count(distinct c.nasabah_id)::int
            from public.cash_transactions c, batas b
           where c.tipe = 'MASUK'
             and c.kategori = 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        )
      ) as j
    ),
    tren as (
      select coalesce(json_agg(t order by t.urutan), '[]'::json) as j
        from (
          select gs.urutan,
                 to_char(gs.bulan, 'TMMon YYYY') as label_panjang,
                 coalesce((select sum(l.amount)
                             from public.loans l
                            where l.created_at >= (gs.bulan::timestamp at time zone 'Asia/Jakarta')
                              and l.created_at < ((gs.bulan + interval '1 month')::timestamp at time zone 'Asia/Jakarta')
                              and l.status <> 'rejected'), 0)::bigint as pencairan,
                 coalesce((select sum(c.nominal)
                             from public.cash_transactions c
                            where c.tipe = 'MASUK'
                              and c.kategori = 'Pembayaran Angsuran/Pelunasan'
                              and c.created_at >= (gs.bulan::timestamp at time zone 'Asia/Jakarta')
                              and c.created_at < ((gs.bulan + interval '1 month')::timestamp at time zone 'Asia/Jakarta')), 0)::bigint as terkumpul,
                 coalesce((select sum(i.amount)
                             from public.installments i
                            where i.due_date >= gs.bulan::date
                              and i.due_date < (gs.bulan + interval '1 month')::date), 0)::bigint as jatuh_tempo
            from generate_series(
                   date_trunc('month', make_date(v_tahun, v_bulan, 1) - interval '5 month')::date,
                   date_trunc('month', make_date(v_tahun, v_bulan, 1))::date,
                   interval '1 month') with ordinality as gs(bulan, urutan)
        ) t
    ),
    status as (
      select coalesce(json_agg(s order by s.urutan), '[]'::json) as j
        from (
          select k.kode, k.label, k.urutan,
                 coalesce(count(p.id) filter (where la.id is not null), 0)::int as jumlah,
                 coalesce(sum(la.sisa), 0)::bigint as sisa
            from (values
                    ('LANCAR'::text,     'Lancar',     1),
                    ('PERINGATAN'::text, 'Perhatian',  2),
                    ('MACET'::text,      'Macet',      3)
                 ) as k(kode, label, urutan)
            left join public.profiles p
                   on p.role = 'nasabah' and p.status_keandalan::text = k.kode
            left join loan_agg la on la.user_id = p.id
           group by k.kode, k.label, k.urutan
        ) s
    ),
    top_nasabah as (
      select coalesce(json_agg(t), '[]'::json) as j
        from (
          select p.full_name as nama,
                 p.nik,
                 p.status_keandalan::text as status,
                 count(la.id)::int as pinjaman,
                 coalesce(sum(la.sisa), 0)::bigint as sisa
            from public.profiles p
            join loan_agg la on la.user_id = p.id
           where p.role = 'nasabah'
           group by p.id, p.full_name, p.nik, p.status_keandalan
           order by coalesce(sum(la.sisa), 0) desc
           limit 5
        ) t
    ),
    arus_kas as (
      select json_build_object(
        'masuk_pembayaran', (
          select coalesce(sum(c.nominal), 0)::bigint
            from public.cash_transactions c, batas b
           where c.tipe = 'MASUK'
             and c.kategori = 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        ),
        'masuk_lain', (
          select coalesce(sum(c.nominal), 0)::bigint
            from public.cash_transactions c, batas b
           where c.tipe = 'MASUK'
             and c.kategori <> 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        ),
        'keluar_pencairan', (
          select coalesce(sum(c.nominal), 0)::bigint
            from public.cash_transactions c, batas b
           where c.tipe = 'KELUAR'
             and c.kategori = 'Pencairan Pinjaman'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        ),
        'keluar_lain', (
          select coalesce(sum(c.nominal), 0)::bigint
            from public.cash_transactions c, batas b
           where c.tipe = 'KELUAR'
             and c.kategori <> 'Pencairan Pinjaman'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
        )
      ) as j
    ),
    metode as (
      select coalesce(json_agg(m order by m.total desc), '[]'::json) as j
        from (
          select coalesce(nullif(btrim(c.metode), ''), 'Tunai') as metode,
                 count(*)::int as jumlah,
                 coalesce(sum(c.nominal), 0)::bigint as total
            from public.cash_transactions c, batas b
           where c.tipe = 'MASUK'
             and c.kategori = 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
           group by coalesce(nullif(btrim(c.metode), ''), 'Tunai')
        ) m
    ),
    kinerja as (
      select coalesce(json_agg(k order by k.total desc), '[]'::json) as j
        from (
          select coalesce(p.full_name, '(tak dikenal)') as nama,
                 count(*)::int as transaksi,
                 coalesce(sum(c.nominal), 0)::bigint as total
            from public.cash_transactions c
            left join public.profiles p on p.id = c.dicatat_oleh
            cross join batas b
           where c.tipe = 'MASUK'
             and c.kategori = 'Pembayaran Angsuran/Pelunasan'
             and c.created_at >= b.ts_dari and c.created_at < b.ts_sampai
           group by p.full_name
           limit 5
        ) k
    )
    select json_build_object(
      'periode',     (select j from periode),
      'ringkasan',   (select j from ringkasan),
      'tren',        (select j from tren),
      'status',      (select j from status),
      'top_nasabah', (select j from top_nasabah),
      'arus_kas',    (select j from arus_kas),
      'metode',      (select j from metode),
      'kinerja',     (select j from kinerja)
    )
  );
end;
$$;
