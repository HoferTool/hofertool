-- =================================================================
--  NC-PRO → HOFER CAM: Vorlagen je Maschine
--
--  Wunsch Patrick 5. November 2026: „im NC Pro einen Bereich Hofer Cam,
--  maschinenspezifische NC-Codes erzeugen: Programmkopf, Ende und Start
--  und Ende der Bearbeitungen, dort die NC-Codes aus den einzelnen Tools
--  einfügen“.
--   - cam_vorlagen: je Maschine (machine_id) eine Zeile mit den
--     Vorlagen in „daten“ (Programmkopf, Programmende und je Art der
--     Bearbeitung ein Start- und ein Ende-Block).
--   - Die zusammengesetzten Programme speichert die App in der schon
--     vorhandenen Tabelle nc_programme mit art = 'cam'.
--  Lesen alle Angemeldeten ausser Externen und Dienst, ändern alle mit
--  Schreibrecht ausser Externen und Dienst. Wer und wann setzt die
--  Datenbank.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.cam_vorlagen (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references public.machines(id) on delete cascade,
  daten         jsonb not null default '{}'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create unique index if not exists cam_vorlagen_maschine on public.cam_vorlagen (machine_id);

create or replace function public.cam_vorlagen_stempel() returns trigger
language plpgsql set search_path = public as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'cam_vorlagen_stempel') then
    create trigger cam_vorlagen_stempel before insert or update on public.cam_vorlagen
      for each row execute function public.cam_vorlagen_stempel();
  end if;
end $$;

alter table public.cam_vorlagen enable row level security;
grant select, insert, update, delete on public.cam_vorlagen to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'cam_vorlagen' and policyname = 'cam_vorlagen lesen') then
    create policy "cam_vorlagen lesen" on public.cam_vorlagen for select to authenticated
      using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'cam_vorlagen' and policyname = 'cam_vorlagen schreiben') then
    create policy "cam_vorlagen schreiben" on public.cam_vorlagen for all to authenticated
      using ((select public.darf_schreiben()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'))
      with check ((select public.darf_schreiben()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cam_vorlagen')
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cam_vorlagen') >= 2
  and exists (select 1 from pg_trigger where tgname = 'cam_vorlagen_stempel')
  then 'ok' else 'FEHLT' end as cam_vorlagen;
