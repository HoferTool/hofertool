-- =================================================================
--  Solarwerte nicht mehr automatisch löschen (1.814.0)
--  Wunsch Patrick 25. November 2026: „soll ab jetzt nicht automatisch
--  gelöscht werden“. Bis jetzt löschte jede Meldung des Solar-Logs
--  (solar_melden) und solar_aufraeumen() alle Werte älter als 90 Tage.
--  Diese Datei schreibt beide Funktionen neu, ohne das Löschen.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create or replace function public.solar_melden(schluessel text, werte jsonb, nur_pruefen boolean default false)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  w jsonb := coalesce(werte, '{}'::jsonb);
begin
  if schluessel is null or not exists (
       select 1 from public.solar_zugang z where z.schluessel = solar_melden.schluessel) then
    raise exception 'Falscher Solar-Schlüssel' using errcode = '28000';
  end if;
  if nur_pruefen then
    return 'Schlüssel ok';
  end if;
  -- Höchstens ein Wert pro Minute: schützt vor einem Skript, das aus
  -- Versehen dauernd läuft, und vor doppelten Werten beim Wechsel.
  if exists (select 1 from public.solar_werte where gemessen > now() - interval '50 seconds') then
    return 'schon gemeldet';
  end if;
  insert into public.solar_werte (produktion_w, verbrauch_w, netz_w, batterie_w,
                                  ertrag_tag_kwh, bezug_tag_kwh, eingespeist_tag_kwh, quelle)
  values (nullif(w->>'produktion_w', '')::numeric,
          nullif(w->>'verbrauch_w', '')::numeric,
          nullif(w->>'netz_w', '')::numeric,
          nullif(w->>'batterie_w', '')::numeric,
          nullif(w->>'ertrag_tag_kwh', '')::numeric,
          nullif(w->>'bezug_tag_kwh', '')::numeric,
          nullif(w->>'eingespeist_tag_kwh', '')::numeric,
          left(coalesce(w->>'quelle', 'Solar-Log'), 60));
  -- Seit 1.814.0 kein Löschen alter Werte mehr (Wunsch Patrick)
  return 'ok';
end $function$;

-- Bleibt als Name bestehen, damit ältere Aufrufe nicht scheitern, tut aber nichts mehr
create or replace function public.solar_aufraeumen()
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  select null::void;
$function$;

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn keine der beiden Funktionen mehr löscht
select case when exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('solar_melden', 'solar_aufraeumen')
    and p.prosrc ilike '%delete from public.solar_werte%')
  then 'FEHLT' else 'ok' end as probe;
