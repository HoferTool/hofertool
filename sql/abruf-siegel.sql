-- =================================================================
--  ABRUFINFORMATION UND SIEGEL IM AUFTRAGSFENSTER
--
--  Wunsch Patrick 8. Oktober 2026:
--  - Jeder Auftrag bekommt ein Textfeld "Abrufinformation", frei
--    geschrieben, z. B. "je 1000 Stk KW 44, 45, 46". Es gehört nur
--    zum Auftrag, nicht zu den Stammdaten der HOCO Nr.
--  - Das Siegel (Kürzel von wem eingeplant) steht in der
--    Schnellvorschau neben der HOCO Nr.
--
--  Was das Skript macht:
--  1. Neue Spalte jobs.abruf_info.
--  2. Die Planwand-Sicht liefert dazu abruf_info, geplant_von (das
--     Siegel; fehlte bisher, darum ging es beim erneuten Öffnen
--     verloren) und created_at (ab wann die Abrufinformation Pflicht
--     ist). Was sie bisher liefert, bleibt genau gleich, auch der
--     Schutz für Externe.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- ---------- 1. Die Spalte ----------
alter table public.jobs add column if not exists abruf_info text;


-- ---------- 2. Die Planwand-Sicht bekommt die Spalten ----------
do $$
declare
  d text;
  invoker boolean;
  fehlt text[] := '{}';
  sp text;
begin
  if to_regclass('public.planwand') is null then return; end if;
  foreach sp in array array['abruf_info', 'geplant_von', 'created_at'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'planwand'
                     and column_name = sp) then
      fehlt := fehlt || ('ja.' || sp);
    end if;
  end loop;
  if array_length(fehlt, 1) is null then return; end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;

  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, '
       || array_to_string(fehlt, ', ') || ' from (' || d || ') v '
       || 'left join public.jobs ja on ja.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';


-- ---------- 3. Probe ----------
select 'jobs.abruf_info' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'jobs' and column_name = 'abruf_info')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'planwand liefert ' || sp,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'planwand' and column_name = sp)
            then 'ok' else 'FEHLT' end
  from unnest(array['abruf_info', 'geplant_von', 'created_at']) as sp;
