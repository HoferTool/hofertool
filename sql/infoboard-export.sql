-- =================================================================
--  INFOBOARD → HOFER TOOL, Schritt 1: Export aus dem SQL Server
--
--  Im SSMS ausführen (F5), Ergebnis mit Rechtsklick → Save Results
--  As … → CSV speichern als  infoboard_export.csv
--
--  Was das Skript tut:
--   · nimmt alle Balken ab 1. Januar 2022
--   · nur die auf Zeilen der Gruppe "Maschinen" — Lieferanten,
--     Mitarbeiter und Ferien bleiben draussen
--   · ersetzt Zeilenumbrüche im Text durch " | ", damit das CSV
--     eine Zeile je Auftrag hat (das war beim ersten Versuch das
--     Problem: mehrzeilige Texte zerrissen die Datei)
--   · ersetzt Strichpunkte im Text durch Kommas, damit das CSV mit
--     Strichpunkt als Trenner sauber bleibt
--
--  Reines Lesen, nichts wird verändert.
-- =================================================================

USE [IB33DB];

SELECT
  i.Idx                                                     AS ib_idx,
  REPLACE(REPLACE(REPLACE(REPLACE(i.ItemText,
      CHAR(13) + CHAR(10), ' | '), CHAR(10), ' | '), CHAR(13), ' | '), ';', ',')
                                                            AS text,
  CONVERT(varchar(19), i.StartTime, 120)                    AS start_zeit,
  CONVERT(varchar(19), i.EndTime, 120)                      AS end_zeit,
  i.RequiredQuantity                                        AS soll_menge,
  i.CurrentQuantity                                         AS ist_menge,
  i.CompletedPercent                                        AS prozent,
  i.MainColor                                               AS farbe,
  i.CheckSymbol                                             AS zeichen,
  i.Priority                                                AS prioritaet,
  CONVERT(varchar(19), i.LastChange, 120)                   AS geaendert,
  i.LastEditedBy                                            AS geaendert_von,
  REPLACE(REPLACE(REPLACE(r.RowName,
      CHAR(13) + CHAR(10), ' '), CHAR(10), ' '), ';', ',')  AS maschine,
  r.Idx                                                     AS maschine_idx,
  i.ExternalId                                              AS ib_guid
FROM T_InfoBoardItem i
JOIN T_VItem v      ON v.InfoBoardItemId = i.Idx AND v.IsMaster = 1
JOIN T_Row r        ON r.Idx = v.RowId
JOIN T_RowGroup rg  ON rg.Idx = r.RowGroupId
WHERE rg.RgName = N'Maschinen'
  AND i.EndTime >= '2022-01-01'
ORDER BY i.StartTime;
