-- =================================================================
--  INFOBOARD FÜR ALLE
--
--  Das Infoboard (Zeile „haupt“ in der Tabelle infoboard) dürfen seit
--  1.241.0 alle Angemeldeten gestalten, ausser Externen (Wunsch Patrick
--  28. Oktober 2026: „das Infoboard und den Kalender sollen alle
--  bearbeiten können, ausser die Externen“). Der Empfang und seine
--  Layouts bleiben bei den Admins (bisherige Regeln bleiben bestehen,
--  diese hier kommen nur dazu). Der Kalender erlaubt das schon
--  (sql/kalender.sql), dort ändert nur die App.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'infoboard anlegen alle') then
    create policy "infoboard anlegen alle" on public.infoboard for insert to authenticated
      with check (id = 'haupt' and (select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'infoboard aendern alle') then
    create policy "infoboard aendern alle" on public.infoboard for update to authenticated
      using (id = 'haupt' and (select public.darf_lesen()) and not (select public.ist_extern()))
      with check (id = 'haupt' and (select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when (select count(*) from pg_policies where schemaname = 'public'
    and tablename = 'infoboard' and policyname in ('infoboard anlegen alle', 'infoboard aendern alle')) = 2
  then 'ok' else 'FEHLT' end as infoboard_alle;
