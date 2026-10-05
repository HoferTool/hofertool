-- =================================================================
--  MASCHINENTYP BEI DER HOCO NR. HINTERLEGEN
--
--  Sobald ein Auftrag auf einer Maschine auf "Rüsten", "QS", "Läuft"
--  oder "Fertig" steht, merkt sich die Datenbank den Maschinentyp
--  dieser Maschine bei der HOCO Nr. (Tabelle hoco_type_data). Lief
--  eine Nummer auf mehreren Typen, stehen dort mehrere Typen.
--
--  Was dieses Skript macht:
--    1. Ein Auslöser an den Aufträgen trägt den Typ ab jetzt bei
--       jedem Zustandswechsel von selbst ein, egal ob er auf der
--       Planwand, im Pad Mode oder sonstwo geändert wird.
--    2. Kommt ein Einrichtblatt für eine HOCO Nr., die es in den
--       Stammdaten noch gar nicht gibt, wird die Nummer angelegt,
--       damit Einrichtblatt und Typ trotzdem gespeichert werden.
--       (Den Typ selbst trägt das Hochladen eines Einrichtblatts
--       schon heute ein.)
--    3. Einmalig werden alle bisherigen Aufträge nachgetragen.
--
--  Es wird nichts gelöscht und nichts überschrieben; vorhandene
--  Einträge (Programm Nr., Stückzeit, Einrichtblatt …) bleiben.
--  Unabhängig von einrichtblatt-ordner.sql, Reihenfolge egal.
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- 1. Typ bei Zustandswechsel eintragen ------------------------------
create or replace function public.jobs_typ_merken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  typ uuid;
begin
  if new.job_number is null or new.machine_id is null
     or coalesce(new.plan_status, '') not in ('ruesten', 'qs', 'laeuft', 'fertig') then
    return new;
  end if;
  -- Nur echte HOCO Nummern wie 10844-0049
  if new.job_number !~ '^\d{5}-\d{4}$' then
    return new;
  end if;
  select m.type_id into typ from public.machines m where m.id = new.machine_id;
  if typ is null then
    return new;
  end if;
  begin
    insert into public.hoco_type_data (hoco_nr, type_id)
    values (new.job_number, typ)
    on conflict (hoco_nr, type_id) do nothing;
  exception when others then
    -- Das Merken ist Beiwerk: der Auftrag wird in jedem Fall gespeichert
    raise warning 'Typ für % nicht gemerkt: %', new.job_number, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists jobs_typ_merken on public.jobs;
create trigger jobs_typ_merken
  after insert or update of plan_status, machine_id, job_number on public.jobs
  for each row execute function public.jobs_typ_merken();

-- 2. Fehlende HOCO Nr. in den Stammdaten anlegen --------------------
create or replace function public.hoco_typ_stamm_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.hoco_parts (hoco_nr) values (new.hoco_nr)
  on conflict (hoco_nr) do nothing;
  return new;
end;
$$;

drop trigger if exists hoco_typ_stamm_anlegen on public.hoco_type_data;
create trigger hoco_typ_stamm_anlegen
  before insert on public.hoco_type_data
  for each row execute function public.hoco_typ_stamm_anlegen();

-- 3. Bisherige Aufträge nachtragen ----------------------------------
insert into public.hoco_type_data (hoco_nr, type_id)
select distinct j.job_number, m.type_id
from public.jobs j
join public.machines m on m.id = j.machine_id
where j.plan_status in ('ruesten', 'qs', 'laeuft', 'fertig')
  and j.job_number ~ '^\d{5}-\d{4}$'
  and m.type_id is not null
on conflict (hoco_nr, type_id) do nothing;

notify pgrst, 'reload schema';

-- Probe
select 'Auslöser an den Aufträgen' as punkt,
       case when exists (select 1 from pg_trigger where tgname = 'jobs_typ_merken'
                           and tgrelid = 'public.jobs'::regclass) then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Stammdaten bei neuem Einrichtblatt',
       case when exists (select 1 from pg_trigger where tgname = 'hoco_typ_stamm_anlegen'
                           and tgrelid = 'public.hoco_type_data'::regclass) then 'ok' else 'FEHLT' end
union all
select 'Bisherige Aufträge nachgetragen',
       case when not exists (
              select 1 from public.jobs j join public.machines m on m.id = j.machine_id
              where j.plan_status in ('ruesten', 'qs', 'laeuft', 'fertig')
                and j.job_number ~ '^\d{5}-\d{4}$' and m.type_id is not null
                and not exists (select 1 from public.hoco_type_data d
                                where d.hoco_nr = j.job_number and d.type_id = m.type_id))
            then 'ok, ' || (select count(*) from public.hoco_type_data) || ' Einträge'
            else 'FEHLT' end;
