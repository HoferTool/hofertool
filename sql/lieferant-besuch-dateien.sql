-- =================================================================
--  PDFS UND BILDER JE VERTRETERBESUCH
--
--  Wunsch Patrick 6. November 2026: „bei den Vertreterbesuchen möchte
--  ich auch PDF/Bilder ablegen können für Angebote“.
--
--  Neue Spalte lieferant_besuche.dateien: Liste der Dateien zum Besuch
--  [{name, url, pfad, typ}]. Die Dateien selbst liegen in der Ablage
--  „zeichnungen“ unter lieferanten/<id>/besuche/<besuch>/. Die Rechte
--  bleiben wie beim Besuch (lesen alle ausser Externen, ändern mit
--  Schreibrecht).
--
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.lieferant_besuche add column if not exists dateien jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'lieferant_besuche' and column_name = 'dateien') then 'ok' else 'FEHLT' end as probe;
