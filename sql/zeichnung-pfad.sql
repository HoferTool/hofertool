-- =================================================================
--  ZEICHNUNG: PFAD AUF DEM LAUFWERK
--  Neue Spalte hoco_parts.zeichnung_quelle. Der Pool-Rechner
--  (zeichnungen.ps1) schreibt dort hinein, woher die Zeichnung kommt:
--  { "pfad": "\\Server\Freigabe\...\Teil.pdf", "url": "<Adresse in der App>" }.
--  Die App zeigt den Pfad nur, solange "url" noch die Zeichnung der
--  HOCO Nr. ist (von Hand ersetzt: kein Pfad). Mehrfach ausführbar.
-- =================================================================
alter table public.hoco_parts add column if not exists zeichnung_quelle jsonb;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'hoco_parts' and column_name = 'zeichnung_quelle')
  then 'ok' else 'FEHLT' end as zeichnung_quelle;
