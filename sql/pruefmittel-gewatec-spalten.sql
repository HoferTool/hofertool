-- =================================================================
--  PRÜFMITTEL: Spalten wie in Gewatec (seit 1.797.0, Wunsch Patrick
--  25. November 2026: Liste mit Status, Nr, Bezeichnung, Typ,
--  Hersteller, Nennmass, Messbereich, Lagerort).
--  Fügt die Spalten typ, hersteller, nennmass und messbereich hinzu.
--  Vorhandenes bleibt. Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.pruefmittel add column if not exists typ text;
alter table public.pruefmittel add column if not exists hersteller text;
alter table public.pruefmittel add column if not exists nennmass text;
alter table public.pruefmittel add column if not exists messbereich text;

notify pgrst, 'reload schema';

select case when (select count(*) from information_schema.columns where table_name = 'pruefmittel'
  and column_name in ('typ', 'hersteller', 'nennmass', 'messbereich')) = 4 then 'ok' else 'FEHLT' end as probe;
