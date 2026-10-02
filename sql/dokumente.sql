-- =================================================================
--  DOKUMENTE
--
--  Eine Tabelle für alle Dateien, die an einer HOCO Nr. oder an
--  einem Maschinentyp hängen: Zeichnungen, WBG, Einrichtblätter und
--  alles Weitere, was später dazukommt.
--
--  Die Art steht als Text drin, damit neue Arten keine Änderung an
--  der Datenbank brauchen. Heute verwendet die App:
--    zeichnung · wbg · einrichtblatt · sonstiges
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

create table if not exists public.dokumente (
  id          uuid primary key default gen_random_uuid(),
  art         text not null default 'sonstiges',
  hoco_nr     text,
  type_id     uuid references public.machine_types(id) on delete cascade,
  titel       text,
  dateiname   text,
  datei_url   text not null,
  groesse     bigint,
  notiz       text,
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid references public.profiles(id) on delete set null
);

-- Schnell finden, was zu einer Nummer oder einem Typ gehört
create index if not exists idx_dokumente_hoco on public.dokumente (hoco_nr);
create index if not exists idx_dokumente_typ  on public.dokumente (type_id);
create index if not exists idx_dokumente_art  on public.dokumente (art);

-- Dieselbe Datei nicht zweimal
create unique index if not exists idx_dokumente_eindeutig
  on public.dokumente (coalesce(hoco_nr, ''), coalesce(type_id::text, ''), art, dateiname);

alter table public.dokumente enable row level security;

drop policy if exists "dokumente lesen" on public.dokumente;
create policy "dokumente lesen" on public.dokumente
  for select to authenticated using (true);

drop policy if exists "dokumente schreiben" on public.dokumente;
create policy "dokumente schreiben" on public.dokumente
  for all to authenticated using (true) with check (true);

-- Einrichtblatt als PDF, falls blattpdf.sql noch nicht gelaufen ist
alter table public.machine_types  add column if not exists blatt_url text;
alter table public.hoco_type_data add column if not exists blatt_url text;
alter table public.hoco_type_data add column if not exists abend_stk integer;
create unique index if not exists idx_hoco_type_data_eindeutig
  on public.hoco_type_data (hoco_nr, type_id);

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle dokumente' as punkt,
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'dokumente')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'machine_types.blatt_url',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'machine_types'
                           and column_name = 'blatt_url') then 'ok' else 'FEHLT' end
union all
select 'hoco_type_data.blatt_url',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'hoco_type_data'
                           and column_name = 'blatt_url') then 'ok' else 'FEHLT' end
union all
select 'hoco_type_data.abend_stk',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'hoco_type_data'
                           and column_name = 'abend_stk') then 'ok' else 'FEHLT' end;
