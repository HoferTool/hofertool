-- =================================================================
--  ROTES M TROTZ MATERIALMENGE
--  Wunsch Patrick, 12. Oktober 2026: Im Auftragsfenster unter „Menge
--  vorhanden oder bestellt“ ein Häkchen „M trotzdem zeigen“. Ist es
--  gesetzt, steht auf dem Balken das rote M, auch wenn bei der Menge
--  etwas eingetragen ist (zum Beispiel: bestellt, aber noch nicht da).
--  Diese Datei legt dafür die Spalte jobs.material_m_trotzdem an.
--  Ohne sie zeigt die App das Häkchen grau. Mehrfach ausführbar.
-- =================================================================
alter table public.jobs add column if not exists material_m_trotzdem boolean not null default false;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'jobs' and column_name = 'material_m_trotzdem')
  then 'ok' else 'FEHLT' end as material_m_trotzdem;
