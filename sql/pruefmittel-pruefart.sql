-- =================================================================
--  PRÜFMITTEL: WER PRÜFT (Wunsch Patrick 24. November 2026: „es gibt
--  solche, die man nach Zeit prüfen muss, einige extern, einige selber“).
--  Neue Spalte pruefung_wo: 'intern' (selber prüfen) oder 'extern'
--  (Kalibrierung auswärts). Leer = nicht festgelegt.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.pruefmittel add column if not exists pruefung_wo text;
notify pgrst, 'reload schema';
select case when exists (select 1 from information_schema.columns
  where table_name = 'pruefmittel' and column_name = 'pruefung_wo') then 'ok' else 'FEHLT' end as probe;
