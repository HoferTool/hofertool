-- =================================================================
--  PROFILBILD BEI DEN KONTAKTPERSONEN DER LIEFERANTEN
--
--  Wunsch Patrick 3. November 2026: „ein Foto soll auch hinzugefügt
--  werden können (Profilbild)“. Zwei Spalten in lieferant_kontakte:
--  foto_url (Adresse des Bildes) und foto_pfad (Ort in der Ablage
--  „zeichnungen“ unter lieferanten/<id>/profil/). Die Rechte bleiben
--  wie bei den Kontakten.
--
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.lieferant_kontakte add column if not exists foto_url text;
alter table public.lieferant_kontakte add column if not exists foto_pfad text;

notify pgrst, 'reload schema';

select case when count(*) = 2 then 'ok' else 'FEHLT' end as probe
from information_schema.columns
where table_schema = 'public' and table_name = 'lieferant_kontakte' and column_name in ('foto_url', 'foto_pfad');
