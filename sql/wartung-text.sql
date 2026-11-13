-- Wartung mit Text statt Bild oder PDF (seit 1.517.0, Wunsch Patrick
-- 13. November 2026: „nicht nur PDFs oder Bilder, sondern das Feld gleich
-- mit Text beschreiben, mit Farbpalette oben“).
-- Was es tut: Pläne und Vorlagen bekommen zwei Spalten für den Text
-- (reiner Text und die Formatierung als kleines HTML). Eine Wartung mit
-- Text hat art = 'text' und keine Datei, darum darf url leer sein.
-- Gefahrlos mehrfach ausführbar.
alter table public.wartung_plan add column if not exists inhalt text;
alter table public.wartung_plan add column if not exists inhalt_fmt text;
alter table public.wartung_vorlagen add column if not exists inhalt text;
alter table public.wartung_vorlagen add column if not exists inhalt_fmt text;
alter table public.wartung_plan alter column url drop not null;
alter table public.wartung_vorlagen alter column url drop not null;
notify pgrst, 'reload schema';
-- Probe
select case when (select count(*) from information_schema.columns where table_schema = 'public'
  and table_name in ('wartung_plan', 'wartung_vorlagen') and column_name in ('inhalt', 'inhalt_fmt')) = 4
  and (select count(*) from information_schema.columns where table_schema = 'public'
  and table_name in ('wartung_plan', 'wartung_vorlagen') and column_name = 'url' and is_nullable = 'YES') = 2
  then 'ok' else 'FEHLT' end as probe;
