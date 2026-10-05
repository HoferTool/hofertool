-- =================================================================
--  ALLES VOM 5. OKTOBER 2026 ABEND IN EINER DATEI
--
--  Im NEUEN Supabase-Projekt ausführen (lzhqwbxfwqamauntehof):
--  alles markieren, in den SQL Editor einfügen, einmal auf Run.
--
--  Darin stecken zwei Skripte von heute Abend, die in der Live-Datenbank
--  noch nicht gelaufen waren (am 5. Oktober 2026, 23:40, nachgeschaut).
--  Die Einzeldateien bleiben im Ordner sql/ liegen, brauchen aber nicht
--  mehr ausgeführt zu werden.
--
--    1  pad-skizze.sql             Zeichenfläche im Pad Mode (111.58.0)
--    2  zeichnung-automatisch.sql  Zeichnung der HOCO Nr. kommt von
--                                  selbst an den Auftrag (111.60.0);
--                                  ergänzt dabei 559 Aufträge
--
--  Nicht dabei, mit Absicht:
--    notiz-ohne-doppel.sql      lief schon (20:50)
--    Zeichnungs-Ordner (111.61.0) braucht kein SQL; der Ordner wird in
--                               der App unter Einstellungen > Dokumente
--                               eingetragen.
--    offenes-passwort-weg.sql   darf nie laufen
--
--  Am Ende steht eine Zeile "Alles eingerichtet" mit ok
--  (sonst FEHLT mit dem fehlenden Teil).
--
--  Läuft gefahrlos mehrfach: Ein zweiter Lauf ändert nichts mehr.
--  Bricht etwas ab, bleibt die Datenbank, wie sie vorher war.
-- =================================================================


-- =================================================================
--  TEIL 1: ZEICHENFLÄCHE IM PAD MODE (aus pad-skizze.sql)
-- =================================================================
-- ---------- 1. Die Tabelle ----------
create table if not exists public.pad_skizzen (
  job_id        uuid primary key references public.jobs (id) on delete cascade,
  striche       jsonb not null default '[]'::jsonb,
  geaendert_am  timestamptz not null default now(),
  geaendert_von uuid default auth.uid()
);


-- ---------- 2. Wer darf was ----------
alter table public.pad_skizzen enable row level security;

drop policy if exists "skizzen alle" on public.pad_skizzen;
create policy "skizzen alle" on public.pad_skizzen
  for all to authenticated using (true) with check (true);

do $$
begin
  if to_regprocedure('public.ist_extern()') is not null then
    execute 'drop policy if exists "extern gesperrt" on public.pad_skizzen';
    execute 'create policy "extern gesperrt" on public.pad_skizzen as restrictive for all '
         || 'to authenticated using (not public.ist_extern()) with check (not public.ist_extern())';
  end if;
end $$;

grant select, insert, update, delete on public.pad_skizzen to authenticated;


-- ---------- 3. Bei "Fertig" weg ----------
create or replace function public.pad_skizze_weg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan_status = 'fertig' and coalesce(old.plan_status, '') <> 'fertig' then
    delete from public.pad_skizzen where job_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists jobs_skizze_weg on public.jobs;
create trigger jobs_skizze_weg after update of plan_status on public.jobs
  for each row execute function public.pad_skizze_weg();


-- =================================================================
--  TEIL 2: ZEICHNUNG AUTOMATISCH AN DEN AUFTRAG
--          (aus zeichnung-automatisch.sql)
-- =================================================================
-- 1. Neuer oder umbenannter Auftrag ---------------------------------
create or replace function public.jobs_stammdaten_holen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if new.job_number is null then
    return new;
  end if;
  if new.drawing_url is not null
     and (coalesce(new.material_bez, '') <> '' or coalesce(new.plan_status, '') = 'fertig') then
    return new;
  end if;
  begin
    select h.zeichnung_url, h.material into t
    from public.hoco_parts h where h.hoco_nr = new.job_number;
    if found then
      if new.drawing_url is null and coalesce(t.zeichnung_url, '') <> '' then
        new.drawing_url := t.zeichnung_url;
      end if;
      if coalesce(new.material_bez, '') = '' and coalesce(t.material, '') <> ''
         and coalesce(new.plan_status, '') <> 'fertig' then
        new.material_bez := t.material;
      end if;
    end if;
  exception when others then
    -- Beiwerk: der Auftrag wird in jedem Fall gespeichert
    raise warning 'Stammdaten für % nicht geholt: %', new.job_number, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists jobs_stammdaten_holen on public.jobs;
create trigger jobs_stammdaten_holen
  before insert or update of job_number on public.jobs
  for each row execute function public.jobs_stammdaten_holen();

-- 2. HOCO Nr. bekommt eine Zeichnung --------------------------------
create or replace function public.hoco_zeichnung_verteilen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.zeichnung_url, '') <> '' then
    begin
      update public.jobs set drawing_url = new.zeichnung_url
      where job_number = new.hoco_nr and drawing_url is null;
    exception when others then
      raise warning 'Zeichnung für % nicht verteilt: %', new.hoco_nr, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists hoco_zeichnung_verteilen on public.hoco_parts;
create trigger hoco_zeichnung_verteilen
  after insert or update of zeichnung_url on public.hoco_parts
  for each row execute function public.hoco_zeichnung_verteilen();

-- 3. Bisherige Aufträge ergänzen ------------------------------------
-- "Zuletzt geändert" soll bei den rund 560 Aufträgen nicht auf heute
-- springen, nur weil die Zeichnung nachgetragen wird. Darum ist der
-- Auslöser dafür kurz aus und wird gleich danach wieder eingeschaltet.
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'jobs_geaendert'
               and tgrelid = 'public.jobs'::regclass) then
    alter table public.jobs disable trigger jobs_geaendert;
  end if;
end $$;

update public.jobs j set drawing_url = h.zeichnung_url
from public.hoco_parts h
where h.hoco_nr = j.job_number and j.drawing_url is null and coalesce(h.zeichnung_url, '') <> '';

update public.jobs j set material_bez = h.material
from public.hoco_parts h
where h.hoco_nr = j.job_number and coalesce(j.material_bez, '') = ''
  and coalesce(h.material, '') <> '' and coalesce(j.plan_status, '') <> 'fertig';

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'jobs_geaendert'
               and tgrelid = 'public.jobs'::regclass) then
    alter table public.jobs enable trigger jobs_geaendert;
  end if;
end $$;


notify pgrst, 'reload schema';


-- =================================================================
--  ERGEBNIS: eine Zeile
-- =================================================================
with probe(teil, gut) as (values
  ('1 Tabelle pad_skizzen',
     to_regclass('public.pad_skizzen') is not null),
  ('1 Zeichnung verschwindet bei Fertig',
     exists (select 1 from pg_trigger where tgname = 'jobs_skizze_weg')),
  ('2 Auslöser am Auftrag',
     exists (select 1 from pg_trigger where tgname = 'jobs_stammdaten_holen'
             and tgrelid = 'public.jobs'::regclass)),
  ('2 Auslöser an der HOCO Nr.',
     exists (select 1 from pg_trigger where tgname = 'hoco_zeichnung_verteilen'
             and tgrelid = 'public.hoco_parts'::regclass)),
  ('2 alle Aufträge haben die Zeichnung ihrer HOCO Nr.',
     not exists (select 1 from public.jobs j join public.hoco_parts h on h.hoco_nr = j.job_number
                 where j.drawing_url is null and coalesce(h.zeichnung_url, '') <> '')),
  ('"Zuletzt geändert" wieder an',
     not exists (select 1 from pg_trigger where tgname = 'jobs_geaendert'
                   and tgrelid = 'public.jobs'::regclass and tgenabled = 'D'))
)
select 'Alles eingerichtet' as punkt,
       coalesce('FEHLT: ' || string_agg(teil, ', ') filter (where not gut), 'ok') as ergebnis
  from probe;
