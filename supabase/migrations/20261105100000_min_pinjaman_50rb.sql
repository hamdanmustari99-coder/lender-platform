-- M17: minimum peminjaman diturunkan dari Rp500.000 ke Rp50.000
--
-- Revisi operator: "untuk minimum peminjaman nya itu paling kecil 50 ribu rupiah".
-- Batas atas tetap Rp20.000.000.
--
-- Fungsi di bawah di-copy verbatim dari schema.sql; satu-satunya perubahan
-- adalah angka batas bawah (500000 -> 50000) dan pesan errornya, supaya
-- perilaku lain tidak berubah.

-- 1. CHECK constraint di tabel loans
alter table public.loans
  drop constraint if exists loans_amount_check;

alter table public.loans
  add constraint loans_amount_check check (amount between 50000 and 20000000);

-- 2. approve_loan (pencairan, nominal final)
create or replace function public.approve_loan(p_loan_id uuid, p_amount_override bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  lr record;
  pay bigint;
  due date;
  step interval;
  v_final bigint;
begin
  -- cek admin DULUAN
  if not public.is_admin() then
    raise exception 'Only admin can approve loans';
  end if;
  select * into lr from public.loans where id = p_loan_id for update;
  if lr.id is null then
    raise exception 'Loan tidak ditemukan';
  end if;
  if lr.status not in ('submitted','under_review') then
    raise exception 'Loan is not in an approvable state';
  end if;

  -- v3.0: nominal final ditentukan admin (default = amount/requested).
  -- v2.0: bunga flat per periode (15%): total = amount + 15%
  v_final := coalesce(p_amount_override, lr.amount);
  if v_final is null or v_final < 50000 or v_final > 20000000 then
    raise exception 'Nominal final harus Rp50rb - Rp20jt';
  end if;
  if lr.frequency = 'monthly' and lr.tenor_months not in (1,3) then
    raise exception 'Untuk bulanan pilih tenor 1 atau 3 bulan';
  end if;
  pay := ceil((v_final + v_final * lr.interest_rate / 100) / lr.tenor_months)::bigint;
  step := case when lr.frequency = 'weekly'
              then make_interval(weeks => 1)
              else make_interval(months => 1) end;

  update public.loans
     set status = 'disbursed', amount = v_final, monthly_payment = pay,
         decided_by = auth.uid(), decided_at = now()
   where id = p_loan_id;

  for i in 1..lr.tenor_months loop
    due := (current_date + step * i);
    insert into public.installments (loan_id, seq, due_date, amount)
    values (p_loan_id, i, due, pay);
  end loop;

  insert into public.notifications (user_id, title, body, type)
  values (lr.user_id, 'Pinjaman Disetujui',
          'Pinjaman Anda sebesar Rp' || v_final || ' telah disetujui. Cicilan ' || case when lr.frequency = 'weekly' then 'mingguan' else 'bulanan' end || ' sebesar Rp' || pay || ' x ' || lr.tenor_months || ' periode. Cicilan pertama jatuh tempo pada ' || (current_date + step)::date,
          'loan_status');
end;
$$;

-- 3. admin_create_loan (admin buat pinjaman langsung)
create or replace function public.admin_create_loan(p_user_id uuid, p_amount bigint, p_tenor int, p_frequency loan_frequency, p_purpose text default '', p_collateral_type text default '', p_collateral_detail text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admin can create loans';
  end if;
  if p_amount is null or p_amount < 50000 or p_amount > 20000000 then
    raise exception 'Nominal harus Rp50rb - Rp20jt';
  end if;
  if p_frequency = 'monthly' and p_tenor not in (1,3) then
    raise exception 'Untuk bulanan pilih tenor 1 atau 3 bulan';
  end if;
  if p_frequency = 'weekly' and (p_tenor < 1 or p_tenor > 52) then
    raise exception 'Untuk mingguan tenor 1-52 minggu';
  end if;
  insert into public.loans (user_id, amount, requested_amount, tenor_months, frequency, monthly_payment, purpose, collateral_type, collateral_detail, status)
  values (p_user_id, p_amount, p_amount, p_tenor, p_frequency, p_amount, coalesce(p_purpose,''), coalesce(p_collateral_type,''), coalesce(p_collateral_detail,''), 'submitted')
  returning id into v_id;
  perform public.approve_loan(v_id, p_amount);
  return v_id;
end;
$$;
