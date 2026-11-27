-- =================================================================
--  GRIDFINITY: Projekte in der Datenbank
--
--  Im Gridfinity-Werkzeug lassen sich Boxen und Grundplatten als Projekt
--  mit Namen speichern und an jedem Gerät wieder öffnen (Wunsch Patrick
--  27. November 2026: „mache noch einen Speicher für Projekte“).
--   - name: Name des Projekts
--   - daten: alle Einstellungen (Box, Grundplatte, Drucker, Fächer-
--     Elemente), daraus entsteht jederzeit wieder die STL
--  Lesen, anlegen, ändern und löschen alle Angemeldeten ausser
--  Externen und dem Dienstkonto. Wer und wann setzt die Datenbank.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.gridfinity_projekte (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'projekt',
  daten         jsonb not null,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists gridfinity_projekte_geaendert on public.gridfinity_projekte (geaendert_am desc);

create or replace function public.gridfinity_projekte_stempel() returns trigger
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
  if not exists (select 1 from pg_trigger where tgname = 'gridfinity_projekte_stempel') then
    create trigger gridfinity_projekte_stempel before insert or update on public.gridfinity_projekte
      for each row execute function public.gridfinity_projekte_stempel();
  end if;
end $$;

alter table public.gridfinity_projekte enable row level security;
grant select, insert, update, delete on public.gridfinity_projekte to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'gridfinity_projekte' and policyname = 'gridfinity_projekte alle') then
    create policy "gridfinity_projekte alle" on public.gridfinity_projekte for all to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'))
      with check ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'gridfinity_projekte')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'gridfinity_projekte')
  and exists (select 1 from pg_trigger where tgname = 'gridfinity_projekte_stempel')
  then 'ok' else 'FEHLT' end as gridfinity_projekte;
