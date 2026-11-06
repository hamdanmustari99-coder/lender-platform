-- ============================================================
-- DEBUG v2: perluas pencarian literal enum lama ke SEMUA schema,
-- default kolom, CHECK constraint, dan view. Juga cetak label
-- enum loan_status yang aktif. Fungsi ini di-drop pada migration
-- perbaikan.
-- ============================================================

create or replace function public.debug_enum_refs()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'enum_labels', (
      select coalesce(json_agg(e.enumlabel order by e.enumsortorder), '[]'::json)
      from pg_catalog.pg_type t
      join pg_catalog.pg_enum e on e.enumtypid = t.oid
      where t.typname = 'loan_status'
    ),
    'functions_all_schemas', (
      select coalesce(json_agg(json_build_object(
        'oid', p.oid,
        'name', n.nspname || '.' || p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'src', left(p.prosrc, 800)
      ) order by p.oid), '[]'::json)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog', 'information_schema')
        and (p.prosrc ilike '%under_review%' or p.prosrc ilike '%submitted%')
    ),
    'column_defaults', (
      select coalesce(json_agg(json_build_object(
        'table', tab.relname,
        'column', col.attname,
        'default', pg_get_expr(def.adbin, def.adrelid)
      )), '[]'::json)
      from pg_catalog.pg_attrdef def
      join pg_catalog.pg_class tab on tab.oid = def.adrelid
      join pg_catalog.pg_attribute col on col.attrelid = def.adrelid and col.attnum = def.adnum
      join pg_catalog.pg_namespace ns on ns.oid = tab.relnamespace
      where ns.nspname = 'public'
        and pg_get_expr(def.adbin, def.adrelid) ilike '%under_review%'
    ),
    'check_constraints', (
      select coalesce(json_agg(json_build_object(
        'table', tab.relname,
        'constraint', con.conname,
        'expr', pg_get_expr(con.conbin, con.conrelid)
      )), '[]'::json)
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class tab on tab.oid = con.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = tab.relnamespace
      where ns.nspname = 'public'
        and con.contype = 'c'
        and pg_get_expr(con.conbin, con.conrelid) ilike '%under_review%'
    ),
    'views', (
      select coalesce(json_agg(json_build_object('view', c.relname, 'def', v.viewname)), '[]'::json)
      from pg_catalog.pg_views v
      join pg_catalog.pg_class c on c.relname = v.viewname
      join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public'
        and v.definition ilike '%under_review%'
    ),
    'policies', (
      select coalesce(json_agg(json_build_object(
        'table', tab.relname,
        'policy', pol.polname,
        'qual', pg_get_expr(pol.polqual, pol.polrelid),
        'with_check', pg_get_expr(pol.polwithcheck, pol.polrelid)
      ) order by tab.relname), '[]'::json)
      from pg_catalog.pg_policy pol
      join pg_catalog.pg_class tab on tab.oid = pol.polrelid
      join pg_catalog.pg_namespace ns on ns.oid = tab.relnamespace
      where ns.nspname = 'public'
        and (
          pg_get_expr(pol.polqual, pol.polrelid) ilike '%under_review%'
          or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%under_review%'
        )
    )
  );
$$;
