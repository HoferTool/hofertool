-- =================================================================
--  PAUSENRAUM
--
--  Der Bildschirm im Pausenraum (quer, 1920 × 1080, mit Touch; Wunsch
--  Patrick 30. Oktober 2026) steht wie Infoboard und Empfang als eigene
--  Zeile „pausenraum“ in der Tabelle infoboard. Gestalten dürfen ihn wie
--  das Infoboard alle Angemeldeten ausser Externen. Lesen dürfen schon
--  alle ausser Externen (bestehende Regel „infoboard lesen“).
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'pausenraum anlegen alle') then
    create policy "pausenraum anlegen alle" on public.infoboard for insert to authenticated
      with check (id = 'pausenraum' and (select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'infoboard' and policyname = 'pausenraum aendern alle') then
    create policy "pausenraum aendern alle" on public.infoboard for update to authenticated
      using (id = 'pausenraum' and (select public.darf_lesen()) and not (select public.ist_extern()))
      with check (id = 'pausenraum' and (select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when (select count(*) from pg_policies where schemaname = 'public'
    and tablename = 'infoboard' and policyname in ('pausenraum anlegen alle', 'pausenraum aendern alle')) = 2
  then 'ok' else 'FEHLT' end as pausenraum;
