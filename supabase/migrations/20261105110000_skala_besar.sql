-- M20: fondasi skala besar — index, paginasi, dan agregasi di server.
--
-- Tujuan: supaya aplikasi tetap cepat saat nasabah/pinjaman/cicilan numpuk
-- (ribuan nasabah, puluhan ribu cicilan) TANPA perlu refactor besar nanti.
--
-- Isi:
--   1. Index tambahan untuk query yang dipakai UI (filter, sort, join)
--   2. Agregasi laporan di server (bukan hitung di browser)
--   3. Daftar nasabah ber-paginasi + flag telat sekali jalan
--   4. Setoran harian ber-paginasi
--
-- Semua fungsi security definer + cek is_admin(), mengikuti pola schema.sql.

-- ============================================================
-- 1. INDEX
-- ============================================================

-- loans: UI selalu sort created_at desc dan filter status
create index if not exists idx_loans_created on public.loans(created_at desc);
create index if not exists idx_loans_status_created on public.loans(status, created_at desc);

-- installments: filter status + sort due_date (dashboard nunggak, cron overdue)
create index if not exists idx_inst_due_status on public.installments(due_date, status);
create index if not exists idx_inst_status_due on public.installments(status, due_date);

-- payments: sudah ada idx_pay_loan/petugas/nasabah; tambah sort paid_at
create index if not exists idx_pay_paid_at on public.payments(paid_at desc);
create index if not exists idx_pay_void_of on public.payments(void_of);

-- profiles: sort created_at desc + filter role/kyc
create index if not exists idx_profiles_created on public.profiles(created_at desc);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_kyc on public.profiles(kyc_status);

-- notifications: sort created_at desc (daftar notif mobile)
create index if not exists idx_notif_created on public.notifications(created_at desc);

-- kyc_documents / loan_documents: sort created_at
create index if not exists idx_kyc_created on public.kyc_documents(created_at desc);
create index if not exists idx_loan_docs_created on public.loan_documents(created_at desc);

-- ============================================================
-- 2. AGREGASI LAPORAN (dulu dihitung di browser)
-- ============================================================

-- Ringkasan laporan: total tagihan, sudah masuk, sisa piutang, laba kotor,
-- dan rincian sisa piutang per nasabah (urut terbesar).
--
-- Sebelumnya Laporan.tsx menarik SEMUA loans + SEMUA installments ke browser
-- lalu reduce() sendiri. Dengan ribuan pinjaman itu = puluhan ribu baris
-- ditransfer dan dihitung di HP/laptop user. Sekarang Postgres yang hitung.
create or replace function public.laporan_ringkasan()
returns json
language sql
security definer
set search_path = public
stable
as $$
  with aktif as (
    select l.*
      from public.loans l
     where l.status <> 'rejected'
  ),
  agg as (
    select
      coalesce(sum(a.amount + round(a.amount * a.interest_rate / 100)
                   + coalesce(a.late_fee, 0)), 0)::bigint as total_tagihan,
      coalesce(sum(round(a.amount * a.interest_rate / 100)), 0)::bigint as laba
      from aktif a
  ),
  bayar as (
    select coalesce(sum(i.amount_paid), 0)::bigint as total_bayar
      from public.installments i
      join aktif a on a.id = i.loan_id
  ),
  per_nasabah as (
    select
      a.user_id,
      coalesce(p.full_name, '(tanpa nama)') as nama,
      coalesce(p.email, '') as email,
      coalesce(sum(a.amount + round(a.amount * a.interest_rate / 100)
                   + coalesce(a.late_fee, 0)), 0)::bigint as total_tagihan,
      coalesce(sum(i.amount_paid), 0)::bigint as total_bayar,
      greatest(coalesce(sum(a.amount + round(a.amount * a.interest_rate / 100)
                   + coalesce(a.late_fee, 0)), 0)
              - coalesce(sum(i.amount_paid), 0), 0)::bigint as sisa,
      count(*) filter (
        where i.status <> 'paid'
          and i.due_date < (now() at time zone 'Asia/Jakarta')::date
      )::int as nunggak
      from aktif a
      left join public.profiles p on p.id = a.user_id
      left join public.installments i on i.loan_id = a.id
     group by a.user_id, p.full_name, p.email
  )
  select json_build_object(
    'totalTagihan', (select total_tagihan from agg),
    'totalBayar',    (select total_bayar from bayar),
    'totalSisa',     greatest((select total_tagihan from agg) - (select total_bayar from bayar), 0),
    'laba',          (select laba from agg),
    'jumlahNunggak', (select count(*) from per_nasabah where nunggak > 0),
    'perNasabah',    (select json_agg(r order by r.sisa desc)
                        from (select user_id as "nasabahId", nama, email,
                                     total_tagihan as "totalTagihan",
                                     total_bayar as "totalBayar",
                                     sisa, nunggak
                                from per_nasabah) r)
  );
$$;

revoke all on function public.laporan_ringkasan() from public, anon;
grant execute on function public.laporan_ringkasan() to authenticated;

-- ============================================================
-- 3. DAFTAR NASABAH BER-PAGINASI + FLAG TELAT
-- ============================================================

-- Sebelumnya Users.tsx menarik SEMUA profiles lalu slice(0,50) di browser,
-- dan flag telat di-fetch per user (N+1). Sekarang satu call: halaman + flag.
--
-- p_role / p_kyc bertipe text lalu di-cast ke enum, supaya PostgREST bisa
-- mengirim string biasa dari JSON.
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
stable
as $$
declare
  v_size   int := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset int := (greatest(coalesce(p_page, 1), 1) - 1) * v_size;
  v_role   user_role;
  v_kyc    kyc_status;
begin
  if not public.is_admin() then
    raise exception 'Only admin can list nasabah';
  end if;

  -- cast di luar query; null / nilai ngawur = tanpa filter
  begin v_role := p_role::user_role; exception when others then v_role := null; end;
  begin v_kyc  := p_kyc::kyc_status;  exception when others then v_kyc  := null; end;

  return (
    with filtered as (
      select p.*
        from public.profiles p
       where (v_role is null or p.role = v_role)
         and (v_kyc is null or p.kyc_status = v_kyc)
         and (p_search is null
              or p.full_name ilike '%' || p_search || '%'
              or p.email ilike '%' || p_search || '%'
              or p.phone ilike '%' || p_search || '%'
              or p.nik ilike '%' || p_search || '%')
    ),
    page as (
      select * from filtered
       order by created_at desc
       limit v_size
       offset v_offset
    ),
    telat as (
      select distinct l.user_id
        from public.loans l
        join public.installments i on i.loan_id = l.id
       where i.status <> 'paid'
         and i.due_date < (now() at time zone 'Asia/Jakarta')::date
    )
    select json_build_object(
      'total', (select count(*) from filtered),
      'page', greatest(coalesce(p_page, 1), 1),
      'pageSize', v_size,
      'rows', (select coalesce(json_agg(row_to_json(pg) order by pg.created_at desc), '[]'::json)
                 from (select pg.id, pg.full_name, pg.email, pg.phone, pg.nik,
                              pg.role, pg.kyc_status, pg.foto_path,
                              pg.created_at, pg.petugas_id,
                              (t.user_id is not null) as telat
                         from page pg
                         left join telat t on t.user_id = pg.id) pg)
    )
  );
end;
$$;

revoke all on function public.list_nasabah(int, int, text, text, text) from public, anon;
grant execute on function public.list_nasabah(int, int, text, text, text) to authenticated;

-- ============================================================
-- 4. SETORAN HARIAN BER-PAGINASI
-- ============================================================

-- Sebelumnya Setoran.tsx menarik 2000 payment terbaru lalu agregasi di browser.
-- Sekarang agregasi di server + paginasi.
--
-- Catatan timezone: agregasi lama di browser pakai paid_at.slice(0,10) = tanggal
-- UTC, jadi setoran malam hari (>= 17:00 UTC) tercatat di hari berikutnya di WIB.
-- Di sini sengaja dikonversi ke Asia/Jakarta supaya tanggal setoran sesuai
-- tanggal lokal operator. Ini sekaligus membetulkan bug timezone lama.
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
stable
as $$
declare
  v_size   int := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset int := (greatest(coalesce(p_page, 1), 1) - 1) * v_size;
begin
  if not public.is_admin() then
    raise exception 'Only admin can list setoran';
  end if;

  return (
    with agg as (
      select
        (pm.paid_at at time zone 'Asia/Jakarta')::date as tanggal,
        pm.petugas_id,
        coalesce(p.full_name, pm.petugas_id::text) as petugas_nama,
        coalesce(sum(pm.amount), 0)::bigint as total,
        count(*)::int as jumlah
        from public.payments pm
        left join public.profiles p on p.id = pm.petugas_id
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
                 from (select tanggal, petugas_id as "petugasId",
                              petugas_nama as "petugasNama", total, jumlah
                         from agg
                        order by tanggal desc, total desc
                        limit v_size
                        offset v_offset) r)
    )
  );
end;
$$;

revoke all on function public.setoran_harian(int, int, date, date) from public, anon;
grant execute on function public.setoran_harian(int, int, date, date) to authenticated;
