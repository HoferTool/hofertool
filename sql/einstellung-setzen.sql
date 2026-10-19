-- =================================================================
--  Persönliche Einstellung einzeln speichern (19. Oktober 2026)
--
--  Bisher schrieb die App bei jeder Einstellung die ganze Liste
--  profiles.einstellungen, so wie sie dieses Gerät kannte. War das
--  Konto auf zwei Geräten angemeldet, überschrieb das eine dabei, was
--  das andere eben gespeichert hatte. Diese Funktion ändert nur den
--  einen Wert und lässt alle anderen stehen.
--
--  Läuft mit den Rechten der angemeldeten Person (security invoker)
--  und ändert nur das eigene Konto. Gefahrlos mehrfach ausführbar.
-- =================================================================

create or replace function public.einstellung_setzen(p_name text, p_wert jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
     set einstellungen = coalesce(einstellungen, '{}'::jsonb) || jsonb_build_object(p_name, p_wert)
   where id = auth.uid();
$$;

grant execute on function public.einstellung_setzen(text, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn die Funktion da ist
select case when exists (select 1 from pg_proc where proname = 'einstellung_setzen')
  then 'ok' else 'FEHLT' end as einstellung_setzen;
