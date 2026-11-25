-- Umfragen: alle dürfen jede Umfrage bearbeiten (seit 1.821.0, Wunsch Patrick 25. November 2026:
-- „jeder soll auch bearbeiten können diese“).
-- Wer Umfragen sehen darf (nicht Externe, nicht Dienst), darf bei jeder Umfrage Frage, Text,
-- Bild und Vorschläge ändern sowie Stimmen eintragen und löschen. Schliessen, Löschen der ganzen
-- Umfrage, QR-Code und Sortieren bleiben in der App beim Ersteller und den Admins.
-- Gefahrlos mehrfach ausführbar.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'umfragen' and policyname = 'umfragen alle bearbeiten') then
    create policy "umfragen alle bearbeiten" on public.umfragen for update to authenticated
      using ((select public.umfrage_darf_erstellen())) with check ((select public.umfrage_darf_erstellen()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'umfrage_vorschlaege' and policyname = 'umfrage_vorschlaege alle') then
    create policy "umfrage_vorschlaege alle" on public.umfrage_vorschlaege for all to authenticated
      using ((select public.umfrage_darf_erstellen())) with check ((select public.umfrage_darf_erstellen()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'umfrage_stimmen' and policyname = 'umfrage_stimmen alle eintragen') then
    create policy "umfrage_stimmen alle eintragen" on public.umfrage_stimmen for insert to authenticated
      with check ((select public.umfrage_darf_erstellen()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'umfrage_stimmen' and policyname = 'umfrage_stimmen alle loeschen') then
    create policy "umfrage_stimmen alle loeschen" on public.umfrage_stimmen for delete to authenticated
      using ((select public.umfrage_darf_erstellen()));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when (select count(*) from pg_policies where policyname in
  ('umfragen alle bearbeiten', 'umfrage_vorschlaege alle', 'umfrage_stimmen alle eintragen', 'umfrage_stimmen alle loeschen')) = 4
  then 'ok' else 'FEHLT' end as probe;
