-- =================================================================
--  HOFER-NC-PRO: gespeicherte NC-Programme aus Bohren / Fräsen und
--  Entgraten
--
--  Wie die Konturen lässt sich jedes Programm unter einem Namen
--  speichern und an jedem Gerät wieder öffnen (Wunsch Patrick
--  4. November 2026: „die NC Programme sollen auch hier abgespeichert
--  werden können“).
--   - art: aus welchem Reiter (bohren oder entgraten)
--   - name: Name, z. B. HOCO Nr. (je Reiter eindeutig)
--   - daten: Eingaben
--   - nc: das beim Speichern erzeugte NC-Programm
--  Lesen, anlegen, ändern und löschen alle Angemeldeten ausser
--  Externen und dem Dienstkonto. Wer und wann setzt die Datenbank.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.nc_programme (
  id            uuid primary key default gen_random_uuid(),
  art           text not null,
  name          text not null,
  daten         jsonb not null,
  nc            text not null default '',
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create unique index if not exists nc_programme_name on public.nc_programme (art, lower(name));

create or replace function public.nc_programme_stempel() returns trigger
language plpgsql set search_path = public as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  if tg_op = 'UPDATE' then
    new.erstellt_am := old.erstellt_am;
    new.erstellt_von := old.erstellt_von;
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'nc_programme_stempel') then
    create trigger nc_programme_stempel before insert or update on public.nc_programme
      for each row execute function public.nc_programme_stempel();
  end if;
end $$;

alter table public.nc_programme enable row level security;
grant select, insert, update, delete on public.nc_programme to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'nc_programme' and policyname = 'nc_programme alle') then
    create policy "nc_programme alle" on public.nc_programme for all to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'))
      with check ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'nc_programme')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'nc_programme')
  and exists (select 1 from pg_trigger where tgname = 'nc_programme_stempel')
  then 'ok' else 'FEHLT' end as nc_programme;
