-- =================================================================
--  Ohne Passwort und ohne PIN geht nichts mehr (1.75.0)
--  Wunsch Patrick 14. Oktober 2026: Sobald alle ein Passwort oder eine
--  PIN haben, die Möglichkeit ohne beides ganz entfernen.
--
--  Was diese Datei tut:
--  * Löscht ohne_passwort_setzen (eigenes Konto „Ohne Passwort“) und
--    ohne_passwort_fuer (Admin: „Passwort und PIN entfernen“).
--  * profiles.ohne_passwort bleibt und heisst ab jetzt nur noch
--    „meldet sich mit PIN an“ (pin_setzen setzt es, Passwort löscht es).
--  * Die Server-Funktion pin-anmelden meldet niemanden mehr mit einem
--    Tipp an, auch wenn es noch ein Konto ohne PIN gäbe.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

drop function if exists public.ohne_passwort_setzen();
drop function if exists public.ohne_passwort_fuer(uuid);

notify pgrst, 'reload schema';

-- Probe: beide Funktionen weg, und niemand ist ohne Passwort und PIN
select 'ohne_passwort_setzen weg' as was,
       case when to_regprocedure('public.ohne_passwort_setzen()') is null then 'ok' else 'FEHLT' end as stand
union all
select 'ohne_passwort_fuer weg',
       case when to_regprocedure('public.ohne_passwort_fuer(uuid)') is null then 'ok' else 'FEHLT' end
union all
select 'niemand mit Tipp ohne PIN',
       case when not exists (select 1 from public.profiles p
                             where p.ohne_passwort and coalesce(p.is_active, true)
                               and not exists (select 1 from public.pin_schutz s where s.user_id = p.id))
            then 'ok' else 'FEHLT' end;
