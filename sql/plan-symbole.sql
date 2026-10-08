-- =================================================================
--  SYMBOLE AUF DEN PLANWAND-BALKEN
--
--  Unter Einstellungen → Symbole legt der Admin kleine Bilder mit
--  einer Erklärung an (zum Beispiel "Kack Teili"). Diese Liste liegt
--  schon in app_config und braucht kein SQL.
--
--  Was das Skript macht:
--  1. Neue Spalte jobs.symbole: welche Symbole ein Auftrag hat
--     (Text, mehrere mit Komma).
--  2. Die Planwand-Sicht liefert die neue Spalte mit. Was sie bisher
--     liefert, bleibt genau gleich, auch der Schutz für Externe.
--
--  Ohne dieses Skript lassen sich Symbole anlegen, aber noch keinem
--  Auftrag geben. Läuft gefahrlos mehrfach.
-- =================================================================

-- ---------- 1. Die Spalte ----------
alter table public.jobs add column if not exists symbole text;


-- ---------- 2. Die Planwand-Sicht bekommt die Spalte ----------
do $$
declare
  d text;
  invoker boolean;
begin
  if to_regclass('public.planwand') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'planwand'
               and column_name = 'symbole') then return; end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;

  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, '
       || 'js.symbole from (' || d || ') v '
       || 'left join public.jobs js on js.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';


-- ---------- 3. Probe ----------
select 'jobs.symbole' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'jobs' and column_name = 'symbole')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'planwand liefert symbole',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'planwand' and column_name = 'symbole')
            then 'ok' else 'FEHLT' end;
