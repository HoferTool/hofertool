-- Prüfberichte je Index
-- Was es tut: gibt jeder Excel-Datei aus den Prüfbericht-Ordnern eine Spalte
-- "index_nr". Die Aufgabe HoferTool liest den Index aus dem Excel (Feld "Index")
-- und behält je HOCO Nr. und Index nur den neusten Bericht als Vorlage.
-- Gefahrlos mehrfach ausführbar.

alter table public.pruefbericht_dateien add column if not exists index_nr text;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'pruefbericht_dateien' and column_name = 'index_nr')
  then 'ok' else 'FEHLT' end as probe;
