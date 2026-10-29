-- =================================================================
--  ZEICHNUNG DREHEN (seit 1.252.0, Wunsch Patrick 29. Oktober 2026)
--
--  Im Betrachter lässt sich eine PDF-Zeichnung drehen. Die App legt die
--  gedrehte Datei neu in die Ablage und trägt ihre Adresse überall ein.
--  Hier merkt sie sich je HOCO Nr., wie weit gedreht wurde:
--    { grad, url (gedrehte Datei), von (Datei vorher), pfad (Datei im
--      Zeichnungs-Ordner) }
--  So erkennt die Aufgabe „HoferTool“ die gedrehte Datei als ihre eigene
--  (nicht als Master) und die App dreht eine neue Fassung derselben
--  Datei aus dem Ordner von selbst wieder gleich.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.hoco_parts add column if not exists zeichnung_drehung jsonb;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'hoco_parts' and column_name = 'zeichnung_drehung')
  then 'ok' else 'FEHLT' end as probe;
