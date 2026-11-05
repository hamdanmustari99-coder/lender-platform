-- ============================================================
-- M26b: Backfill cash_transactions dari payments & loans
--
-- Masalah: saat cleanup data uji M23, baris cash_transactions
-- dihapus tapi installments.amount_paid & payments TIDAK
-- dikembalikan. Akibatnya buku kas kosong (0 baris) sementara
-- riwayat pembayaran tetap ada — laporan bulanan & Arus Kas
-- jadi menampilkan Rp 0 padahal uang sudah masuk.
--
-- Perbaikan: bangun ulang buku kas dari sumber yang otoritatif.
--   * KELUAR 'Pencairan Pinjaman'  <- setiap pinjaman yang cair
--   * MASUK  'Pembayaran Angsuran/Pelunasan' <- setiap payment
--     yang tidak di-void
--   * KELUAR 'Koreksi Pembayaran' <- setiap payment yang di-void
--
-- Guard: hanya jalan kalau cash_transactions masih kosong, jadi
-- aman dijalankan ulang (idempoten) dan tidak akan menduplikasi
-- baris yang sudah dibuat oleh RPC normal.
-- ============================================================

do $$
declare
  v_kosong boolean;
  v_masuk  bigint := 0;
  v_keluar bigint := 0;
  v_n      bigint := 0;
begin
  select (count(*) = 0) into v_kosong from public.cash_transactions;
  if not v_kosong then
    raise notice 'cash_transactions sudah terisi — backfill dilewati';
    return;
  end if;

  -- 1. Pencairan pinjaman = uang keluar
  insert into public.cash_transactions
    (tipe, kategori, loan_id, nasabah_id, pihak, metode, nominal, catatan, dicatat_oleh, created_at)
  select 'KELUAR',
         'Pencairan Pinjaman',
         l.id,
         l.user_id,
         coalesce(p.full_name, ''),
         'Tunai',
         l.amount,
         'Pencairan pinjaman ' || l.id::text,
         l.dicatat_oleh,
         l.created_at
    from public.loans l
    left join public.profiles p on p.id = l.user_id
   where l.status in ('disbursed', 'active', 'completed')
     and l.amount > 0;
  get diagnostics v_n = row_count;
  v_keluar := v_keluar + v_n;

  -- 2. Pembayaran nasabah = uang masuk (yang tidak di-void)
  insert into public.cash_transactions
    (tipe, kategori, loan_id, nasabah_id, pihak, metode, nominal, catatan, dicatat_oleh, created_at)
  select 'MASUK',
         'Pembayaran Angsuran/Pelunasan',
         pm.loan_id,
         pm.nasabah_id,
         coalesce(p.full_name, ''),
         'Tunai',
         pm.amount,
         coalesce(pm.note, ''),
         pm.dicatat_oleh,
         coalesce(pm.paid_at, pm.created_at)
    from public.payments pm
    left join public.profiles p on p.id = pm.nasabah_id
   where pm.voided_at is null
     and pm.amount > 0;
  get diagnostics v_n = row_count;
  v_masuk := v_masuk + v_n;

  -- 3. Koreksi (payment yang di-void) = uang keluar kembali
  insert into public.cash_transactions
    (tipe, kategori, loan_id, nasabah_id, pihak, metode, nominal, catatan, dicatat_oleh, created_at)
  select 'KELUAR',
         'Koreksi Pembayaran',
         pm.loan_id,
         pm.nasabah_id,
         coalesce(p.full_name, ''),
         'Tunai',
         pm.amount,
         'KOREKSI: ' || coalesce(pm.void_reason, ''),
         pm.dicatat_oleh,
         pm.voided_at
    from public.payments pm
    left join public.profiles p on p.id = pm.nasabah_id
   where pm.voided_at is not null
     and pm.amount > 0;
  get diagnostics v_n = row_count;
  v_keluar := v_keluar + v_n;

  raise notice 'backfill selesai: % baris keluar (pencairan+koreksi), % baris pembayaran', v_keluar, v_masuk;
end $$;
