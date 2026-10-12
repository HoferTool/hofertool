-- =================================================================
--  ROTES M TROTZ MATERIALMENGE
--  Wunsch Patrick, 12. Oktober 2026: Im Auftragsfenster unter „Menge
--  vorhanden oder bestellt“ ein Häkchen „M trotzdem zeigen“. Ist es
--  gesetzt, steht auf dem Balken das rote M, auch wenn bei der Menge
--  etwas eingetragen ist (zum Beispiel: bestellt, aber noch nicht da).
--  Diese Datei legt dafür die Spalte jobs.material_m_trotzdem an und
--  hängt sie an die Ansicht planwand, aus der die Planwand liest (wie
--  abruf-siegel.sql). Ohne sie zeigt die App das Häkchen grau.
--  Mehrfach ausführbar.
-- =================================================================
alter table public.jobs add column if not exists material_m_trotzdem boolean not null default false;

do $$
declare d text; invoker boolean;
begin
  if to_regclass('public.planwand') is null then return; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'planwand' and column_name = 'material_m_trotzdem') then return; end if;
  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;
  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, jm2.material_m_trotzdem from ('
       || d || ') v left join public.jobs jm2 on jm2.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'jobs' and column_name = 'material_m_trotzdem')
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'planwand' and column_name = 'material_m_trotzdem')
  then 'ok' else 'FEHLT' end as material_m_trotzdem;
