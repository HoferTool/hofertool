-- =================================================================
--  508 WERKZEUGE MIT MARKE (Komplettwerkzeuge)
--
--  Wunsch Patrick 12. November 2026: Jedes vorbereitete Komplettwerkzeug
--  der Willemin-Macodel 508 bekommt einen 3D-gedruckten Clip mit einer
--  6-stelligen Nummer (Marke). Im Pad Mode macht man ein Foto von
--  Werkzeug und Clip, weist die Marke beim Bestücken einem Magazinfach
--  zu, und die App führt eine Liste, welche Werkzeuge in der Maschine
--  und welche im Werkzeugschrank sind.
--
--   - marke:   die 6 Ziffern auf dem Clip, eindeutig
--   - name, typ, d: was auf der Maschine steht (Name, Werkzeugtyp, Ø)
--   - ort:     vorbereitet, maschine oder schrank
--   - fach:    Magazinfach, solange es in der Maschine ist
--   - nr:      Werkzeugnummer auf der Maschine (T-Nr. im Programm)
--   - foto_url / foto_pfad: Foto in der Ablage „zeichnungen“
--  Lesen alle Angemeldeten ausser Externen, ändern alle mit
--  Schreibrecht ausser Externen.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.wz508_werkzeuge (
  marke         text primary key check (marke ~ '^[0-9]{6}$'),
  name          text,
  typ           integer,
  d             numeric,
  ort           text not null default 'vorbereitet' check (ort in ('vorbereitet', 'maschine', 'schrank')),
  fach          integer,
  nr            integer,
  notiz         text,
  foto_url      text,
  foto_pfad     text,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);
create index if not exists wz508_werkzeuge_ort on public.wz508_werkzeuge (ort, fach);

-- Wer zuletzt geändert hat, setzt die Datenbank selbst
create or replace function public.wz508_geaendert() returns trigger
language plpgsql as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'wz508_werkzeuge_geaendert') then
    create trigger wz508_werkzeuge_geaendert before update on public.wz508_werkzeuge
      for each row execute function public.wz508_geaendert();
  end if;
end $$;

alter table public.wz508_werkzeuge enable row level security;
grant select, insert, update, delete on public.wz508_werkzeuge to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'wz508_werkzeuge' and policyname = 'wz508 lesen') then
    create policy "wz508 lesen" on public.wz508_werkzeuge for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'wz508_werkzeuge' and policyname = 'wz508 anlegen') then
    create policy "wz508 anlegen" on public.wz508_werkzeuge for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'wz508_werkzeuge' and policyname = 'wz508 aendern') then
    create policy "wz508 aendern" on public.wz508_werkzeuge for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'wz508_werkzeuge' and policyname = 'wz508 loeschen') then
    create policy "wz508 loeschen" on public.wz508_werkzeuge for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'wz508_werkzeuge')
  and (select count(*) from pg_policies where tablename = 'wz508_werkzeuge') = 4
  then 'ok' else 'FEHLT' end as probe;
