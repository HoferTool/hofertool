-- =================================================================
--  PRÜFMITTEL: EINSATZTAGE UND RÜCKGABEKISTE (Wunsch Patrick
--  24. November 2026: „wie viele raus müssen für Prüfung, und wie viele
--  noch in der Rückgabekiste sind … alles auf einmal quittieren …
--  wieder einbuchen, dass die Tage nicht mehr weiter gezählt werden,
--  und wenn man auf läuft stellt, soll es weiterzählen“).
--
--  Neue Spalten an pruefmittel:
--   job_id         für welchen Auftrag es ausgebucht ist
--   einsatz_tage   schon gezählte Tage im Einsatz (seit der letzten Prüfung)
--   zaehlt_seit    läuft gerade, seit wann (leer = zählt nicht)
--   intervall_tage prüfen nach so vielen Einsatztagen (leer = nur Monate)
--  Neuer Ort 'rueckgabe' = Rückgabekiste.
--
--  Ein Auslöser auf den Aufträgen macht den Rest von selbst, egal ob
--  vom Pad, der Produktion oder der Planwand:
--   läuft   → ausgebuchte Prüfmittel dieses Auftrags zählen (weiter)
--   fertig  → sie kommen in die Rückgabekiste (zählen bis zum Quittieren)
--   zurück auf geplant/Rüsten → Zählen hält an
--  Quittieren in der App bucht sie in den Schrank und hält das Zählen an.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.pruefmittel add column if not exists job_id uuid references public.jobs(id) on delete set null;
alter table public.pruefmittel add column if not exists einsatz_tage numeric not null default 0;
alter table public.pruefmittel add column if not exists zaehlt_seit timestamptz;
alter table public.pruefmittel add column if not exists intervall_tage integer;
create index if not exists pruefmittel_job on public.pruefmittel (job_id);

-- Text für den Verlauf kennt jetzt auch die Rückgabekiste
create or replace function public.pruefmittel_ort_text(p public.pruefmittel)
returns text language sql stable security definer set search_path = public as $$
  select case p.ort_art
    when 'schrank' then 'Prüfmittelschrank' || coalesce(' · ' || nullif(p.ort_text, ''), '')
    when 'maschine' then 'Maschine ' || coalesce((select trim(m.name || ' ' || coalesce(m.machine_number, ''))
      from public.machines m where m.id = p.machine_id), '?') || coalesce(' · ' || nullif(p.ort_text, ''), '')
    when 'person' then 'Bei ' || coalesce(nullif(p.ort_text, ''), '?')
    when 'extern' then 'Extern' || coalesce(' · ' || nullif(p.ort_text, ''), '')
    when 'rueckgabe' then 'Rückgabekiste'
    else coalesce(p.ort_text, p.ort_art) end;
$$;

create or replace function public.jobs_pruefmittel_zaehlen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan_status is not distinct from old.plan_status then return new; end if;
  if new.plan_status = 'laeuft' then
    update public.pruefmittel set zaehlt_seit = coalesce(zaehlt_seit, now())
      where job_id = new.id and ort_art = 'maschine';
  elsif new.plan_status = 'fertig' then
    update public.pruefmittel set ort_art = 'rueckgabe', machine_id = null
      where job_id = new.id and ort_art = 'maschine';
  elsif old.plan_status = 'laeuft' then
    update public.pruefmittel
      set einsatz_tage = einsatz_tage + extract(epoch from (now() - zaehlt_seit)) / 86400, zaehlt_seit = null
      where job_id = new.id and zaehlt_seit is not null and ort_art = 'maschine';
  end if;
  return new;
end $$;

drop trigger if exists jobs_pruefmittel_zaehlen on public.jobs;
create trigger jobs_pruefmittel_zaehlen after update of plan_status on public.jobs
  for each row execute function public.jobs_pruefmittel_zaehlen();

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_name = 'pruefmittel' and column_name = 'zaehlt_seit')
  and exists (select 1 from pg_trigger where tgname = 'jobs_pruefmittel_zaehlen') then 'ok' else 'FEHLT' end as probe;
