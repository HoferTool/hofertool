-- =================================================================
--  MATERIAL-ÜBERSICHT (1.67.0)
--
--  Was das tut, in einfachen Worten:
--  Damit man sieht, welches Material wo liegt und ob es für die
--  geplanten Aufträge reicht (Wunsch Patrick 15. Oktober 2026).
--
--  1. Tabelle material_posten: ein Posten ist ein Stück Material
--     (Kiste, Wagen, Bund, Lieferung) mit
--       material   Bezeichnung wie beim Auftrag (X14CrMoS17 rd 024 mm h9)
--       menge, einheit   ungefähr, in kg oder Stangen (stg)
--       ort        wo es liegt (Restelager, Aussenlager Nord …)
--       art        lager = da, bestellt = kommt noch
--       be_nr, lieferant, termin   bei einer Bestellung
--       weg_am     aufgebraucht oder weggenommen, leer = noch da
--     Bestellungen aus der Notiz („Mat BE: …“) rechnet die App selbst
--     dazu, die stehen hier erst, wenn jemand „Ist da“ drückt.
--  2. Bei der HOCO Nr. Durchmesser und Länge des Fertigteils, dazu
--     ob die Länge bestätigt ist (Vorschlag aus dem Einrichtblatt).
--  3. Beim Maschinentyp die Stangenlänge (3 m) und den Rest-Stumpen
--     (250 mm), damit die App die Mindestmenge rechnen kann.
--
--  Lesen und Schreiben dürfen alle Angemeldeten ausser Externen
--  und dem Dienstkonto.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.material_posten (
  id           uuid primary key default gen_random_uuid(),
  material     text not null,
  menge        numeric,
  einheit      text not null default 'kg',
  ort          text,
  art          text not null default 'lager',
  be_nr        text,
  lieferant    text,
  termin       date,
  notiz        text,
  job_id       uuid references public.jobs (id) on delete set null,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid() references public.profiles (id) on delete set null,
  geaendert_am timestamptz,
  geaendert_von uuid references public.profiles (id) on delete set null,
  weg_am       timestamptz,
  weg_von      uuid references public.profiles (id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'material_posten_einheit') then
    alter table public.material_posten add constraint material_posten_einheit check (einheit in ('kg', 'stg'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'material_posten_art') then
    alter table public.material_posten add constraint material_posten_art check (art in ('lager', 'bestellt'));
  end if;
end $$;

create index if not exists material_posten_offen on public.material_posten (weg_am, material);

alter table public.material_posten enable row level security;

drop policy if exists "material_posten alle" on public.material_posten;
create policy "material_posten alle" on public.material_posten
  for all to authenticated
  using (public.darf_lesen() and not public.ist_extern() and not public.bin_dienst())
  with check (public.darf_lesen() and not public.ist_extern() and not public.bin_dienst());

-- Wer zuletzt geändert hat, trägt die Datenbank selbst ein
create or replace function public.material_posten_geaendert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  if new.weg_am is not null and old.weg_am is null then new.weg_von := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists material_posten_geaendert on public.material_posten;
create trigger material_posten_geaendert before update on public.material_posten
  for each row execute function public.material_posten_geaendert();

-- Damit offene Seiten sofort nachziehen
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'material_posten') then
    execute 'alter publication supabase_realtime add table public.material_posten';
  end if;
exception when undefined_object then null;
end $$;

-- Fertigteil je HOCO Nr.
alter table public.hoco_parts add column if not exists teil_d_mm numeric;
alter table public.hoco_parts add column if not exists teil_laenge_mm numeric;
alter table public.hoco_parts add column if not exists teil_mass_bestaetigt boolean not null default false;
alter table public.hoco_parts add column if not exists teil_mass_quelle text;

-- Stangen je Maschinentyp
alter table public.machine_types add column if not exists stangen_mm integer not null default 3000;
alter table public.machine_types add column if not exists stumpen_mm integer not null default 250;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle material_posten' as punkt,
       case when to_regclass('public.material_posten') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regel material_posten',
       case when exists (select 1 from pg_policies where tablename = 'material_posten'
                         and policyname = 'material_posten alle') then 'ok' else 'FEHLT' end
union all
select 'Länge bei HOCO Nr.',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'hoco_parts' and column_name = 'teil_laenge_mm') then 'ok' else 'FEHLT' end
union all
select 'Stangen beim Typ',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'machine_types' and column_name = 'stumpen_mm') then 'ok' else 'FEHLT' end;
