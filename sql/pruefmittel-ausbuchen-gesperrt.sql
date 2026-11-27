-- Gesperrte und fällige Prüfmittel bei der Erstteilprüfung trotzdem ausbuchen
-- (Wunsch Patrick 27. November 2026: „wird jetzt ausgebucht, muss aber bald zur Kontrolle“).
-- 1) pruefmittel_ausbuchen bucht jetzt auch gesperrte aus dem Schrank aus (nicht ausgeschiedene).
-- 2) pruefmittel_pruefstand_lesen() gibt allen (ausser Externen und Dienst) nur die Angaben,
--    die es braucht, um „fällig“ zu erkennen: Intervall, letzte Prüfung, Einsatztage.
--    Die App zeigt dann die Meldung. Gefahrlos mehrfach ausführbar.

create or replace function public.pruefmittel_ausbuchen(p_job uuid, p_ids uuid[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  j record;
  n integer;
begin
  if not (public.darf_schreiben() and not public.ist_extern() and not public.bin_dienst()) then
    raise exception 'keine Berechtigung';
  end if;
  select id, machine_id, plan_status into j from public.jobs where id = p_job;
  if j.id is null or j.machine_id is null then return 0; end if;
  update public.pruefmittel set
    ort_art = 'maschine', machine_id = j.machine_id, job_id = j.id,
    zaehlt_seit = case when j.plan_status = 'laeuft' then now() else zaehlt_seit end
  where id = any(p_ids) and ort_art = 'schrank' and coalesce(status, 'aktiv') in ('aktiv', 'gesperrt');
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.pruefmittel_pruefstand_lesen()
returns table (id uuid, intervall_monate numeric, intervall_tage numeric, letzte_pruefung date,
               einsatz_tage numeric, zaehlt_seit timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.id, p.intervall_monate::numeric, p.intervall_tage::numeric, p.letzte_pruefung::date,
         p.einsatz_tage::numeric, p.zaehlt_seit::timestamptz
  from public.pruefmittel p
  where (select auth.uid()) is not null and not (select public.ist_extern()) and not (select public.bin_dienst());
$$;

grant execute on function public.pruefmittel_ausbuchen(uuid, uuid[]) to authenticated;
grant execute on function public.pruefmittel_pruefstand_lesen() to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'pruefmittel_pruefstand_lesen')
             and position('gesperrt' in (select prosrc from pg_proc where proname = 'pruefmittel_ausbuchen' limit 1)) > 0
       then 'ok' else 'FEHLT' end as probe;
