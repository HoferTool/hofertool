-- =================================================================
--  CAM: AUFBAU DER MASCHINEN UND PROGRAMME ALS VORLAGE
--
--  Für den Reiter „CAM“ unter Rechner (Wunsch Patrick 27. Oktober 2026),
--  zuerst nur für die SW-Maschinen:
--   - cam_aufbau: was die CAM-Seite über einen Maschinentyp wissen muss
--     (Steuerung, Aufgabe jedes Paths, Art jedes Werkzeugplatzes, die
--     M-Befehle). Eine Zeile je Typ (type_id) und dazu höchstens eine je
--     Maschine (machine_id) mit dem, was an dieser Maschine anders ist
--     („Hier ist das anders“, z. B. Hochdruck an der 121).
--   - cam_programme: eure eigenen Programme als Text, aus denen die App
--     euren Stil lernt.
--  Lesen alle Angemeldeten ausser Externen, schreiben alle mit
--  Schreibrecht ausser Externen, Programme löschen wer sie hochgeladen
--  hat und Admins.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.cam_aufbau (
  id            uuid primary key default gen_random_uuid(),
  type_id       uuid references public.machine_types(id) on delete cascade,
  machine_id    uuid references public.machines(id) on delete cascade,
  daten         jsonb not null default '{}'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid(),
  constraint cam_aufbau_ziel check ((type_id is null) <> (machine_id is null))
);
create unique index if not exists cam_aufbau_typ on public.cam_aufbau (type_id) where type_id is not null;
create unique index if not exists cam_aufbau_maschine on public.cam_aufbau (machine_id) where machine_id is not null;

create table if not exists public.cam_programme (
  id            uuid primary key default gen_random_uuid(),
  type_id       uuid references public.machine_types(id) on delete set null,
  machine_id    uuid references public.machines(id) on delete set null,
  name          text not null,
  hoco_nr       text,
  notiz         text,
  inhalt        text not null,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid()
);
create index if not exists cam_programme_typ on public.cam_programme (type_id, erstellt_am desc);

alter table public.cam_aufbau enable row level security;
alter table public.cam_programme enable row level security;
grant select, insert, update, delete on public.cam_aufbau to authenticated;
grant select, insert, update, delete on public.cam_programme to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
declare
  t text;
begin
  foreach t in array array['cam_aufbau', 'cam_programme'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = t || ' lesen') then
      execute format('create policy %I on public.%I for select to authenticated
        using ((select public.darf_lesen()) and not (select public.ist_extern()))', t || ' lesen', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = t || ' anlegen') then
      execute format('create policy %I on public.%I for insert to authenticated
        with check ((select public.darf_schreiben()) and not (select public.ist_extern()))', t || ' anlegen', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = t || ' aendern') then
      execute format('create policy %I on public.%I for update to authenticated
        using ((select public.darf_schreiben()) and not (select public.ist_extern()))
        with check ((select public.darf_schreiben()) and not (select public.ist_extern()))', t || ' aendern', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'cam_aufbau' and policyname = 'cam_aufbau loeschen') then
    create policy "cam_aufbau loeschen" on public.cam_aufbau for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'cam_programme' and policyname = 'cam_programme loeschen') then
    create policy "cam_programme loeschen" on public.cam_programme for delete to authenticated
      using (erstellt_von = (select auth.uid()) or (select public.bin_admin()));
  end if;
end $$;

notify pgrst, 'reload schema';

select 'cam_aufbau' as was, case when to_regclass('public.cam_aufbau') is not null then 'ok' else 'FEHLT' end as stand
union all
select 'cam_programme', case when to_regclass('public.cam_programme') is not null then 'ok' else 'FEHLT' end;
