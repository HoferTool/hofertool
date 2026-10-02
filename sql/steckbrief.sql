-- =================================================================
--  STECKBRIEF DER DATENBANK — liest nur, verändert nichts
--  Gibt in einem Text alle Tabellen mit Spalten, Zugriffsregeln,
--  Funktionen, Auslöser und Sichten aus. Damit DATENBANK.md auffrischen.
-- =================================================================
with
spalten as (
  select c.table_name,
         string_agg(c.column_name || ' ' || c.data_type
                    || case when c.is_nullable = 'NO' then ' NOT NULL' else '' end,
                    ', ' order by c.ordinal_position) as s
  from information_schema.columns c where c.table_schema = 'public' group by c.table_name),
tabellen as (
  select string_agg('- ' || t.table_name || ' (' || lower(t.table_type) || '): ' || s.s, E'\n' order by t.table_name) as x
  from information_schema.tables t join spalten s on s.table_name = t.table_name where t.table_schema = 'public'),
regeln as (
  select string_agg('- ' || tablename || ' · ' || policyname || ' · ' || cmd
                    || coalesce(' · ' || qual, '') || coalesce(' / ' || with_check, ''), E'\n' order by tablename, policyname) as x
  from pg_policies where schemaname = 'public'),
funktionen as (
  select string_agg('- ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', E'\n' order by p.proname) as x
  from pg_proc p where p.pronamespace = 'public'::regnamespace),
ausloeser as (
  select string_agg('- ' || c.relname || ' · ' || t.tgname, E'\n' order by c.relname) as x
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal),
sichten as (
  select string_agg('### ' || viewname || E'\n' || definition, E'\n\n') as x from pg_views where schemaname = 'public')
select '# Datenbank Hofer Tool'
    || E'\n\n## Tabellen und Sichten\n' || coalesce((select x from tabellen), '')
    || E'\n\n## Zugriffsregeln\n'        || coalesce((select x from regeln), '')
    || E'\n\n## Funktionen\n'            || coalesce((select x from funktionen), '')
    || E'\n\n## Auslöser\n'              || coalesce((select x from ausloeser), '')
    || E'\n\n## Sichten\n'               || coalesce((select x from sichten), '')
    as steckbrief;
