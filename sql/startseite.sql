-- =================================================================
--  STARTSEITE JE PERSON  (seit 1.166.0)
--
--  Was diese Datei macht:
--  Neues Feld "Startseite" an jedem Konto (profiles.startseite). Ein
--  Admin wählt es unter Einstellungen → Nutzer. Nach dem Anmelden
--  öffnet die App direkt diese Seite, etwa die Planwand. Leer heisst:
--  wie bisher die Startseite (Wunsch Patrick 24. Oktober 2026).
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

alter table public.profiles add column if not exists startseite text;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'startseite')
  then 'ok' else 'FEHLT' end as probe;
