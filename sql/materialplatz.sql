-- =================================================================
--  MATERIALPLATZ ALS EIGENES FELD
--
--  Im Auftragsfenster gibt es das Feld "Materialplatz" (wo das
--  Material liegt, z. B. "Regal 4 oben"). Bisher stand dieser Hinweis
--  als Zeile "Material: …" in der Notiz. Jetzt bekommt er eine eigene
--  Spalte, damit er unabhängig von Notiz und Bestellung bleibt.
--
--  Was das Skript macht:
--  1. Neue Spalte jobs.material_platz.
--  2. Steht bei einem Auftrag schon eine Zeile "Material: …" in der
--     Notiz, wandert sie in die neue Spalte und aus der Notiz heraus.
--  3. Die Planwand-Sicht liefert die neue Spalte mit. Was sie bisher
--     liefert, bleibt genau gleich, auch der Schutz für Externe.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- ---------- 1. Die Spalte ----------
alter table public.jobs add column if not exists material_platz text;


-- ---------- 2. Bisherige Hinweise aus der Notiz übernehmen ----------
update public.jobs
   set material_platz = coalesce(nullif(material_platz, ''),
         trim(substring(plan_note from '(?:^|\n)[ \t]*[Mm][Aa][Tt][Ee][Rr][Ii][Aa][Ll]:[ \t]*([^\n]*)'))),
       plan_note = nullif(trim(regexp_replace(plan_note,
         '(^|\n)[ \t]*[Mm][Aa][Tt][Ee][Rr][Ii][Aa][Ll]:[^\n]*', '', 'g')), '')
 where plan_note ~* '(^|\n)[ \t]*material:';


-- ---------- 3. Die Planwand-Sicht bekommt die Spalte ----------
do $$
declare
  d text;
  invoker boolean;
begin
  if to_regclass('public.planwand') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'planwand'
               and column_name = 'material_platz') then return; end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;

  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, '
       || 'jm.material_platz from (' || d || ') v '
       || 'left join public.jobs jm on jm.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';


-- ---------- 4. Probe ----------
select 'jobs.material_platz' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'jobs' and column_name = 'material_platz')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'planwand liefert material_platz',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'planwand' and column_name = 'material_platz')
            then 'ok' else 'FEHLT' end
union all
select 'keine Zeile "Material:" mehr in Notizen',
       case when not exists (select 1 from public.jobs where plan_note ~* '(^|\n)[ \t]*material:')
            then 'ok' else 'FEHLT' end;
