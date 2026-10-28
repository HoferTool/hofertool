-- =================================================================
--  KALENDER
--
--  Für die neue Seite „Kalender“ und das Band unter der Solaranlage auf
--  dem Infoboard (Wunsch Patrick 28. Oktober 2026): wichtige Termine wie
--  Kehrichtabfuhr, Papiersammlung oder Papierkörbe leeren.
--   - titel: was ist
--   - datum: wann (beim ersten Mal)
--   - wiederholung: nie, woche, 2wochen, 4wochen, monat oder jahr
--   - notiz: freiwillig, etwas dazu
--  Lesen dürfen alle Angemeldeten ausser Externen (auch das Konto
--  Infoboard), eintragen, ändern und löschen alle mit Schreibrecht
--  ausser Externen.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.kalender (
  id            uuid primary key default gen_random_uuid(),
  titel         text not null,
  datum         date not null,
  wiederholung  text not null default 'nie',
  notiz         text,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz
);
create index if not exists kalender_datum on public.kalender (datum);

alter table public.kalender enable row level security;
grant select, insert, update, delete on public.kalender to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'kalender' and policyname = 'kalender lesen') then
    create policy "kalender lesen" on public.kalender for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'kalender' and policyname = 'kalender anlegen') then
    create policy "kalender anlegen" on public.kalender for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'kalender' and policyname = 'kalender aendern') then
    create policy "kalender aendern" on public.kalender for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'kalender' and policyname = 'kalender loeschen') then
    create policy "kalender loeschen" on public.kalender for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'kalender')
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kalender') = 4
  then 'ok' else 'FEHLT' end as kalender;
