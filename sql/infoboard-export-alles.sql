-- =================================================================
--  INFOBOARD → HOFER TOOL: Export für den Neustart (9. Oktober 2026)
--
--  Im SSMS auf dem infoBoard-Server ausführen (F5), dann im Ergebnis
--  Rechtsklick → „Save Results As …“ → als  infoboard_alles.csv
--  speichern und im Chat anhängen.
--
--  Wie infoboard-export.sql, aber mit allen Zeilengruppen (Maschinen,
--  Mitarbeiter, Lieferanten …), damit Aufträge UND Ferien aus einer
--  Datei kommen. Die Spalte „gruppe“ sagt, woher ein Balken stammt.
--  Zeilenumbrüche werden zu " | ", Strichpunkte zu Kommas, damit das
--  CSV eine Zeile je Balken hat.
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
  i.ExternalId                                              AS ib_guid,
  REPLACE(rg.RgName, ';', ',')                              AS gruppe
FROM T_InfoBoardItem i
JOIN T_VItem v      ON v.InfoBoardItemId = i.Idx AND v.IsMaster = 1
JOIN T_Row r        ON r.Idx = v.RowId
JOIN T_RowGroup rg  ON rg.Idx = r.RowGroupId
WHERE i.EndTime >= '2022-01-01'
ORDER BY i.StartTime;
