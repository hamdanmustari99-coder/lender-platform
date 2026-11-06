-- ============================================================
-- DEBUG: cari objek live DB yang masih memakai literal enum
-- loan_status lama ('under_review' / 'submitted' / 'approved').
--
-- Latar: hapus nasabah gagal dengan
--   invalid input value for enum loan_status: "under_review"
-- Repo sudah bersih (approve_loan/reject_loan di-drop di M23),
-- jadi tersangkanya policy RLS / trigger / function yang dibuat
-- di luar repo. Fungsi ini HANYA untuk diagnostik dan di-drop
-- pada migration perbaikan.
-- ============================================================

create or replace function public.debug_enum_refs()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'functions', (
      select coalesce(json_agg(json_build_object(
        'oid', p.oid,
        'name', n.nspname || '.' || p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'src', left(p.prosrc, 600)
      ) order by p.oid), '[]'::json)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.prosrc ilike '%under_review%' or p.prosrc ilike '%submitted%' or p.prosrc ilike '%approved%')
    ),
    'policies', (
      select coalesce(json_agg(json_build_object(
        'table', tab.relname,
        'policy', pol.polname,
        'cmd', pol.polcmd::text,
        'qual', pg_get_expr(pol.polqual, pol.polrelid),
        'with_check', pg_get_expr(pol.polwithcheck, pol.polrelid)
      ) order by tab.relname, pol.polname), '[]'::json)
      from pg_catalog.pg_policy pol
      join pg_catalog.pg_class tab on tab.oid = pol.polrelid
      join pg_catalog.pg_namespace ns on ns.oid = tab.relnamespace
      where ns.nspname = 'public'
        and (
          pg_get_expr(pol.polqual, pol.polrelid) ilike '%under_review%'
          or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%under_review%'
          or pg_get_expr(pol.polqual, pol.polrelid) ilike '%submitted%'
          or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%submitted%'
        )
    ),
    'triggers', (
      select coalesce(json_agg(json_build_object(
        'table', t.tgrelid::regclass::text,
        'name', t.tgname,
        'function', t.tgfoid::regproc::text
      ) order by t.tgrelid::regclass::text, t.tgname), '[]'::json)
      from pg_catalog.pg_trigger t
      where not t.tgisinternal
    )
  );
$$;

grant execute on function public.debug_enum_refs() to service_role;
