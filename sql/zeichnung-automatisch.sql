-- =================================================================
--  ZEICHNUNG UND MATERIAL AUTOMATISCH AN DEN AUFTRAG
--
--  Hat eine HOCO Nr. in den Stammdaten eine Zeichnung, hängt sie ab
--  jetzt an jedem Auftrag dieser Nummer, ohne dass jemand die Planwand
--  oder das Auftragsfenster öffnen muss (Wunsch Patrick 5. Oktober 2026).
--
--  Was dieses Skript macht:
--    1. Neuer Auftrag oder geänderte HOCO Nr. am Auftrag: fehlt die
--       Zeichnung, kommt die der HOCO Nr. dazu. Fehlt das Material und
--       ist der Auftrag nicht fertig, kommt auch das Material dazu.
--    2. Bekommt eine HOCO Nr. später eine Zeichnung, bekommen sie alle
--       Aufträge dieser Nummer, die noch keine haben.
--    3. Einmalig werden alle bisherigen Aufträge so ergänzt.
--
--  Überschrieben wird nichts: was am Auftrag schon steht, bleibt.
--  Einrichtblatt, Programm Nr. und Stückzeit hängen am Maschinentyp
--  und werden darum nicht an den Auftrag kopiert; die App sucht sie
--  je nach Maschine selbst.
--  Läuft gefahrlos mehrfach.
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
update public.jobs j set drawing_url = h.zeichnung_url
from public.hoco_parts h
where h.hoco_nr = j.job_number and j.drawing_url is null and coalesce(h.zeichnung_url, '') <> '';

update public.jobs j set material_bez = h.material
from public.hoco_parts h
where h.hoco_nr = j.job_number and coalesce(j.material_bez, '') = ''
  and coalesce(h.material, '') <> '' and coalesce(j.plan_status, '') <> 'fertig';

notify pgrst, 'reload schema';

-- Probe
select 'Auslöser am Auftrag' as punkt,
       case when exists (select 1 from pg_trigger where tgname = 'jobs_stammdaten_holen'
                           and tgrelid = 'public.jobs'::regclass) then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Auslöser an der HOCO Nr.',
       case when exists (select 1 from pg_trigger where tgname = 'hoco_zeichnung_verteilen'
                           and tgrelid = 'public.hoco_parts'::regclass) then 'ok' else 'FEHLT' end
union all
select 'Aufträge ohne Zeichnung, obwohl die HOCO Nr. eine hat',
       case when not exists (select 1 from public.jobs j join public.hoco_parts h on h.hoco_nr = j.job_number
                             where j.drawing_url is null and coalesce(h.zeichnung_url, '') <> '')
            then 'ok, keine mehr' else 'FEHLT' end;
