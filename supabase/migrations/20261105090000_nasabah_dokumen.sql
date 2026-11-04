-- ============================================================
-- M14 — Dokumen & foto nasabah + koordinat lokasi pendaftaran
--
-- Revisi owner:
--  1) Foto nasabah, foto KTP, dan foto jaminan belum pernah tersimpan
--     (Cloudinary URL dibuang, kyc_documents kosong, loan_documents kosong)
--  2) Koordinat shareloc (home_lat/lng, office_lat/lng) tidak ikut tersimpan
--  3) Email dummy nNIK@danaku.test tetap dipertahankan (akun wadah data),
--     tapi profil sekarang menyimpan nama & HP yang benar.
-- ============================================================

-- ---------- 1. Foto nasabah (URL Cloudinary) ----------
alter table public.profiles
  add column if not exists foto_path text default '';   -- sudah ada di live, aman

-- ---------- 2. KYC documents: simpan URL Cloudinary juga ----------
-- kyc_documents.storage_path tadinya hanya path bucket Supabase Storage.
-- Sekarang terima URL Cloudinary penuh (https://res.cloudinary.com/...).
alter table public.kyc_documents
  alter column storage_path type text;

-- ---------- 3. Dokumen jaminan per nasabah (bukan per pinjaman) ----------
-- loan_documents terikat ke loan; jaminan didaftarkan SEBELUM ada pinjaman,
-- jadi perlu tabel sendiri yang terikat ke profil.
create table if not exists public.nasabah_documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  doc_type     text not null default 'jaminan'
               check (doc_type in ('ktp', 'selfie', 'jaminan', 'lainnya')),
  label        text default '',          -- jenis jaminan (BPKB Motor, Emas, ...)
  url          text not null default '', -- URL Cloudinary (public, bisa langsung <img>)
  note         text default '',          -- detail jaminan (Beat 2021 D 1234 AB)
  created_at   timestamptz not null default now()
);
create index if not exists idx_nasabah_docs_user on public.nasabah_documents(user_id);

-- ---------- 4. Koordinat lokasi: pastikan kolom ada ----------
alter table public.profiles
  add column if not exists home_lat   double precision,
  add column if not exists home_lng   double precision,
  add column if not exists office_lat double precision,
  add column if not exists office_lng double precision;

-- ---------- 5. RLS ----------
alter table public.nasabah_documents enable row level security;

drop policy if exists "nasabah docs read" on public.nasabah_documents;
create policy "nasabah docs read" on public.nasabah_documents
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "nasabah docs write" on public.nasabah_documents;
create policy "nasabah docs write" on public.nasabah_documents
  for insert with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "nasabah docs upd" on public.nasabah_documents;
create policy "nasabah docs upd" on public.nasabah_documents
  for update using (public.is_admin());

drop policy if exists "nasabah docs del" on public.nasabah_documents;
create policy "nasabah docs del" on public.nasabah_documents
  for delete using (public.is_admin());
