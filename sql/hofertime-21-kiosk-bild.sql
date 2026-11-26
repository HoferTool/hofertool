-- HOFERTIME Kiosk: Bild und Beschreibung je Artikel
-- (Wunsch Patrick 25. November 2026: „man soll Bild einfügen können und
-- statt Emoji soll Beschreibung stehen“)
--  * beschreibung: kurzer Text unter dem Namen (ersetzt das Emoji)
--  * bild_url: Adresse des Bilds in der Ablage zeichnungen (kiosk/…)
-- Gefahrlos mehrfach ausführbar.

alter table public.kiosk_artikel add column if not exists beschreibung text;
alter table public.kiosk_artikel add column if not exists bild_url text;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kiosk_artikel' and column_name = 'bild_url')
  and exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kiosk_artikel' and column_name = 'beschreibung')
  then 'ok' else 'FEHLT' end as probe;
