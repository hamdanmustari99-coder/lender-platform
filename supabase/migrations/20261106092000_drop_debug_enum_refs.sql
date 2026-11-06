-- ============================================================
-- Cleanup: buang fungsi debug_enum_refs (diagnostik sementara).
--
-- Akar masalah hapus-nasabah sudah ditemukan & diperbaiki:
-- edge function versi M15 yang ter-deploy masih memakai
--   .in('status', ['active','disbursed','under_review','submitted'])
-- sehingga PostgREST mengirim literal 'under_review' ke enum
-- loan_status baru (M23) -> 22P02. Repo M23 sudah benar; fungsi
-- dideploy ulang via `supabase functions deploy danaku-api`.
-- ============================================================

drop function if exists public.debug_enum_refs();
