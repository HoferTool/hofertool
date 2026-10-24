-- =================================================================
--  Einrichtblatt in der App: weitere Seiten
--  Zum Werkzeugblatt kann jedes Einrichtblatt weitere Seiten haben,
--  etwa für Geo-Offset-Daten, Bilder oder Notizen, je mit Namen und
--  hoch oder quer (Wunsch Patrick, 24. Oktober 2026). Sie stehen als
--  Liste in der neuen Spalte „seiten“:
--    [{ "name": "Geo Offset", "quer": true, "html": "…" }, …]
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.einrichtblatt_app add column if not exists seiten jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte einrichtblatt_app.seiten' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'einrichtblatt_app' and column_name = 'seiten') then 'ok' else 'FEHLT' end as ergebnis;
