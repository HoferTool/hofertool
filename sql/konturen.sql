-- =================================================================
--  RECHNER → KONTUR: gespeicherte Konturen mit NC-Programm
--
--  Jede Kontur aus dem Reiter „Kontur“ im Rechner lässt sich unter
--  einem Namen speichern und an jedem Gerät wieder öffnen (Wunsch
--  Patrick 3. November 2026: „die jeweilig erzeugte Korrektur auch
--  abspeichern und wieder öffnen können“).
--   - name: Name, z. B. HOCO Nr. (eindeutig)
--   - daten: Eingabe (Startpunkt, Elemente, Werkzeug)
--   - nc: das beim Speichern erzeugte NC-Programm mit eingerechnetem
--     Schneidenradius, genau so, wie es damals ausgegeben wurde
--  Lesen, anlegen, ändern und löschen alle Angemeldeten ausser
--  Externen und dem Dienstkonto. Wer und wann setzt die Datenbank.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.konturen (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  daten         jsonb not null,
  nc            text not null default '',
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create unique index if not exists konturen_name on public.konturen (lower(name));

create or replace function public.konturen_stempel() returns trigger
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
  if not exists (select 1 from pg_trigger where tgname = 'konturen_stempel') then
    create trigger konturen_stempel before insert or update on public.konturen
      for each row execute function public.konturen_stempel();
  end if;
end $$;

alter table public.konturen enable row level security;
grant select, insert, update, delete on public.konturen to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'konturen' and policyname = 'konturen alle') then
    create policy "konturen alle" on public.konturen for all to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'))
      with check ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'konturen')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'konturen')
  and exists (select 1 from pg_trigger where tgname = 'konturen_stempel')
  then 'ok' else 'FEHLT' end as konturen;
