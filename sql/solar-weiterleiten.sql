-- =================================================================
--  SOLARWERTE VOM ALTEN INS NEUE PROJEKT WEITERGEBEN
--
--  Im ALTEN Supabase-Projekt ausführen (yvbtgiqtndxqqxhjshnl).
--
--  solarlog.ps1 schreibt noch ins alte Projekt. Bis es umgestellt ist,
--  gibt das alte Projekt jeden neuen Wert sofort ans neue weiter — und
--  holt einmal alles nach, was seit dem Umzug dazugekommen ist.
--
--  VORHER: in Zeile 20 den Schlüssel des NEUEN Projekts einsetzen
--  (neues Projekt → Zahnrad → API Keys → Legacy API keys → service_role,
--  oder ein neuer Secret key).
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- Der Schlüssel des NEUEN Projekts — nur hier eintragen
create or replace function public.neues_projekt_schluessel() returns text
language sql immutable as $$
  select 'HIER-DEN-SCHLUESSEL-DES-NEUEN-PROJEKTS-EINSETZEN'::text
$$;

-- Erlaubt der Datenbank, selbst eine Web-Anfrage zu schicken
create extension if not exists pg_net;

-- Kopfzeilen für die Anfrage ans neue Projekt. Alte Schlüssel (eyJ…)
-- gehören in beide Felder, neue (sb_secret_…) nur in "apikey".
create or replace function public.neues_projekt_kopf() returns jsonb
language sql stable as $$
  select jsonb_build_object(
           'apikey', public.neues_projekt_schluessel(),
           'Content-Type', 'application/json',
           'Prefer', 'return=minimal')
         || case when public.neues_projekt_schluessel() like 'eyJ%'
                 then jsonb_build_object('Authorization', 'Bearer ' || public.neues_projekt_schluessel())
                 else '{}'::jsonb end
$$;

-- Jeden neuen Wert sofort weitergeben
create or replace function public.solar_weiterleiten() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://lzhqwbxfwqamauntehof.supabase.co/rest/v1/solar_werte',
    headers := public.neues_projekt_kopf(),
    body    := to_jsonb(new) - 'id');
  return new;
end $$;

drop trigger if exists solar_weiterleiten on public.solar_werte;
create trigger solar_weiterleiten after insert on public.solar_werte
  for each row execute function public.solar_weiterleiten();

-- Einmal nachholen: alles seit dem Umzug (1. Oktober, 15 Uhr)
select net.http_post(
  url     := 'https://lzhqwbxfwqamauntehof.supabase.co/rest/v1/solar_werte',
  headers := public.neues_projekt_kopf(),
  body    := (select coalesce(jsonb_agg(to_jsonb(s) - 'id' order by s.gemessen), '[]'::jsonb)
              from public.solar_werte s
              where s.gemessen > timestamptz '2026-10-01 15:00:00+02')
) as anfrage_nachholen,
(select count(*) from public.solar_werte where gemessen > timestamptz '2026-10-01 15:00:00+02') as werte_nachgeholt;
