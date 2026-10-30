-- =================================================================
--  EINLAGEN GEN: Einlagen in der Datenbank
--
--  Jede Einlage aus dem Reiter „Einlagen Gen (created by Ecker)“ wird
--  von selbst hier gespeichert, damit sie an jedem Gerät weiter
--  bearbeitet werden kann (Wunsch Patrick 30. Oktober 2026: „alle
--  generierten Modelle dort direkt abspeichern, dass es von überall
--  bearbeitbar ist“).
--   - name: Name der Einlage (Feld „Name“ im Werkzeug)
--   - daten: die ganze Einlage wie „Einlage speichern“ (Grundkörper,
--     Werkzeuge mit Kontur, Verbinder), daraus entsteht jederzeit
--     wieder SVG und STL
--  Lesen, anlegen, ändern und löschen alle Angemeldeten ausser
--  Externen und dem Dienstkonto. Wer und wann setzt die Datenbank.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.einlagen (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'einlage',
  daten         jsonb not null,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists einlagen_geaendert on public.einlagen (geaendert_am desc);

create or replace function public.einlagen_stempel() returns trigger
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
  if not exists (select 1 from pg_trigger where tgname = 'einlagen_stempel') then
    create trigger einlagen_stempel before insert or update on public.einlagen
      for each row execute function public.einlagen_stempel();
  end if;
end $$;

alter table public.einlagen enable row level security;
grant select, insert, update, delete on public.einlagen to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'einlagen' and policyname = 'einlagen alle') then
    create policy "einlagen alle" on public.einlagen for all to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'))
      with check ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'einlagen')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'einlagen')
  and exists (select 1 from pg_trigger where tgname = 'einlagen_stempel')
  then 'ok' else 'FEHLT' end as einlagen;
