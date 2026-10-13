-- Stückzahl-Einträge löschen (Wunsch Patrick, 13. Oktober 2026)
--
-- Was diese Datei tut:
--   Bisher durften nur Admins einen Zählerstand löschen. Neu darf es
--   jeder, der auch Zahlen eintragen und ändern darf (Produktion →
--   Erfassen, Knopf „Letzten Eintrag löschen“). Externe weiterhin nur
--   bei den Maschinen ihrer Parks (die bestehende Regel
--   „extern nur eigene stueckzahlen“ bleibt).
-- Gefahrlos mehrfach ausführbar.

drop policy if exists "loeschen" on public.production_records;
create policy "loeschen" on public.production_records
  for delete to authenticated using (public.darf_schreiben());

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn die neue Regel steht
select case when exists (
  select 1 from pg_policies where tablename = 'production_records'
    and policyname = 'loeschen' and qual like '%darf_schreiben%')
  then 'ok' else 'FEHLT' end as stueckzahl_loeschen;
