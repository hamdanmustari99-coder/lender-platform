-- Fix: pay_installment memakai kolom installments.paid_by yang SUDAH DIHAPUS.
--
-- Migrasi 20261105120000_hapus_peran_petugas mendefinisikan ulang
-- record_cash_payment/void_payment/void_and_repay, tetapi TIDAK
-- pay_installment. Akibatnya fungsi live masih menunjuk paid_by ->
-- setiap pemanggilan gagal: column "paid_by" of relation "installments"
-- does not exist (42703).
--
-- Saat ini admin/src tidak memanggil pay_installment (pembayaran memakai
-- record_cash_payment, yang sehat), jadi ini bukan blocker UI. Tetap
-- diperbaiki supaya DB konsisten dengan schema.sql dan tidak menjadi
-- jebakan kalau nanti dipakai lagi.
--
-- Sumber kebenaran: badan fungsi ini disalin verbatim dari supabase/schema.sql
-- (sudah memakai dicatat_oleh + amount_paid).

create or replace function public.pay_installment(p_installment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ins record; v_loan_status loan_status; v_nasabah uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admin can mark installments as paid';
  end if;
  select * into ins from public.installments where id = p_installment_id for update;
  if ins.id is null then
    raise exception 'Cicilan tidak ditemukan';
  end if;
  if ins.status = 'paid' then return; end if;  -- idempotent
  select status into v_loan_status from public.loans where id = ins.loan_id;
  if v_loan_status is null then
    raise exception 'Data pinjaman tidak ditemukan';
  end if;
  -- cegah pay cicilan milik loan yang belum dicairkan / sudah final
  if v_loan_status not in ('disbursed','active') then
    raise exception 'Pinjaman tidak dalam status berjalan';
  end if;
  update public.installments
     set status='paid', amount_paid = ins.amount, paid_at=now(), dicatat_oleh=auth.uid()
   where id = p_installment_id;
  -- v2.0: catat juga ke payments agar rekap setoran konsisten dengan installments
  select user_id into v_nasabah from public.loans where id = ins.loan_id;
  insert into public.payments (loan_id, installment_id, nasabah_id, dicatat_oleh, amount, note)
  values (ins.loan_id, ins.id, v_nasabah, auth.uid(),
          ins.amount - coalesce(ins.amount_paid, 0), 'pelunasan via admin web');
  insert into public.notifications (user_id, title, body, type)
  values (v_nasabah, 'Cicilan Lunas', 'Pembayaran cicilan ke-' || ins.seq || ' sebesar Rp' || ins.amount || ' telah diterima. Terima kasih!', 'info');
  -- jika semua lunas, loan selesai
  if not exists (select 1 from public.installments where loan_id = ins.loan_id and status <> 'paid') then
    update public.loans set status='completed' where id = ins.loan_id;
  end if;
end;
$$;
