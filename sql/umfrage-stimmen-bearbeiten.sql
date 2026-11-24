-- =================================================================
--  UMFRAGEN: STIMMEN VON HAND EINTRAGEN
--
--  Wunsch Patrick 24. November 2026: „wenn man auf Bearbeiten drückt,
--  soll man die Stimmen bearbeiten können, hinzufügen oder löschen“.
--  Wer die Umfrage erstellt hat, und Admins dürfen im Fenster
--  „Bearbeiten“ Stimmen mit Namen eintragen, auch bei geschlossenen
--  Umfragen. Löschen durften sie schon (umfragen-alle.sql).
--  Abstimmen für alle bleibt über umfrage_abstimmen.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Probe am Ende.
-- =================================================================

grant insert on public.umfrage_stimmen to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'umfrage_stimmen' and policyname = 'umfrage_stimmen eintragen') then
    create policy "umfrage_stimmen eintragen" on public.umfrage_stimmen for insert to authenticated
      with check ((select public.bin_admin())
        or ((select public.umfrage_darf_erstellen()) and public.umfrage_ist_meine(umfrage_id)));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'umfrage_stimmen' and policyname = 'umfrage_stimmen eintragen')
  and has_table_privilege('authenticated', 'public.umfrage_stimmen', 'insert')
  then 'ok' else 'FEHLT' end as probe;
