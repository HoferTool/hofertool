-- =================================================================
--  TEMP-ORDNER: Ablegen durch Claude (25. November 2026)
--  Tabelle für einmalige Schlüssel, mit denen die Server-Funktion
--  „temp-ablegen“ eine Datei in den Temp-Ordner einer Person legt.
--  Ohne Regeln: über die App für niemanden lesbar oder änderbar.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
create table if not exists temp_upload (
  schluessel text primary key,
  konto uuid not null,
  gueltig_bis timestamptz not null default now() + interval '1 hour'
);
alter table temp_upload enable row level security;
notify pgrst, 'reload schema';
select case when to_regclass('public.temp_upload') is not null then 'ok' else 'FEHLT' end as probe;
