-- =================================================================
--  PLANWAND ÄNDERT KEINE NUTZER, PASSWÖRTER UND PINS
--
--  Was diese Datei tut, in einfachen Worten:
--  Am 9. Oktober 2026 war kurz geplant, dass das Konto "Planwand" auch
--  Nutzer, Passwörter und PINs ändern darf. Patrick hat es wieder
--  abgesagt ("Oder lass es lieber"). Die Funktionen sind schon wieder
--  auf "nur Admins" zurückgestellt. Diese Datei entfernt die drei
--  Regeln, die dabei schon angelegt worden waren:
--    - Planwand ändert andere Profile (profiles)
--    - Planwand ändert Personen ohne Login (people)
--    - Planwand ändert den PIN der Planwand (app_config.planwand_pin)
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

drop policy if exists "planwand pin" on public.app_config;
drop policy if exists "planwand aendert alle" on public.profiles;
drop policy if exists "planwand aendert" on public.people;
drop function if exists public.bin_einstellungen();

notify pgrst, 'reload schema';

-- ---------- Probe: "ok" heisst, die Regel ist weg ----------
select 'Profile nur Admin' as was,
       case when not exists (select 1 from pg_policies where tablename = 'profiles'
                             and policyname = 'planwand aendert alle') then 'ok' else 'FEHLT' end as stand
union all select 'Personen nur Admin',
       case when not exists (select 1 from pg_policies where tablename = 'people'
                             and policyname = 'planwand aendert') then 'ok' else 'FEHLT' end
union all select 'PIN der Planwand nur Admin',
       case when not exists (select 1 from pg_policies where tablename = 'app_config'
                             and policyname = 'planwand pin') then 'ok' else 'FEHLT' end;
