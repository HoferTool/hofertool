-- =================================================================
--  EIGENE MASCHINEN-NOTIZEN IN DEN UNTERLAGEN
--
--  Bei den Unterlagen einer Maschine lassen sich seit 1.221.0 eigene
--  Dokumente schreiben, mit dem Texteditor des Infoboards (Wunsch
--  Patrick 27. Oktober 2026). Gespeichert wird ein PDF zum Ansehen und
--  Drucken; damit man das Dokument später im Editor weiterbearbeiten
--  kann, steht der Text selbst in der neuen Spalte „inhalt“.
--
--  Was das Skript macht:
--   - neue Spalte maschinen_unterlagen.inhalt (Text des Editors)
--  Die Regeln der Tabelle bleiben, wie sie sind.
--
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.maschinen_unterlagen add column if not exists inhalt text;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte maschinen_unterlagen.inhalt' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'maschinen_unterlagen' and column_name = 'inhalt') then 'ok' else 'FEHLT' end as ergebnis;
