-- =================================================================
--  Prüfberichte: einmalige Schlüssel, damit Claude ein Excel als
--  Vorlage ablegen kann (Server-Funktion pruefbericht-ablegen).
--  Für niemanden in der App lesbar, eine Stunde gültig.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
create table if not exists public.pruefbericht_upload (
  schluessel  text primary key,
  hoco_nr     text not null,
  seite       int,
  gueltig_bis timestamptz not null default now() + interval '1 hour'
);
alter table public.pruefbericht_upload enable row level security;
revoke all on public.pruefbericht_upload from anon, authenticated;
notify pgrst, 'reload schema';
select 'Tabelle pruefbericht_upload' as punkt,
       case when to_regclass('public.pruefbericht_upload') is not null then 'ok' else 'FEHLT' end as ergebnis;
