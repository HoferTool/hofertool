-- =================================================================
--  DIENSTKONTO FÜR DAS HILFSPROGRAMM
--
--  Das Hilfsprogramm auf dem Server meldet sich mit einem eigenen
--  Konto an. Mit der Rolle "dienst" erscheint es auf keiner
--  Kachelwand. Dieses Skript erlaubt die Rolle in der Datenbank.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role is null or role in ('admin', 'planwand', 'langdreher', 'kurzdreher',
                                  'mitarbeiter', 'produktion', 'extern', 'dienst')) not valid;

notify pgrst, 'reload schema';

select 'Rolle dienst erlaubt' as punkt,
       case when pg_get_constraintdef(oid) ilike '%dienst%' then 'ok' else 'FEHLT' end as ergebnis
from pg_constraint where conname = 'profiles_role_check';
