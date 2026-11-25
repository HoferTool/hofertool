-- Prüfmittel ausbuchen bei der Erstteilprüfung für alle (Wunsch Patrick 25. November 2026:
-- „jeder darf das ausfüllen und Freigabe erteilen“).
-- Die Tabelle pruefmittel bleibt nur für Admins. Damit auch Mechaniker und das Pad
-- beim Abschliessen der Erstteilprüfung die Lehren auf den Auftrag ausbuchen können,
-- gibt es zwei Funktionen:
--   pruefmittel_schrank_lesen()      zeigt nur, was im Schrank liegt (Nr., Bezeichnung, Mass, HOCO, Stand)
--   pruefmittel_ausbuchen(job, ids)  bucht genau diese aus dem Schrank auf den Auftrag aus
-- Nicht für Externe, Dienst und reine HOFERTIME-Konten. Gefahrlos mehrfach ausführbar.

create or replace function public.pruefmittel_schrank_lesen()
returns table (id uuid, nr text, bezeichnung text, mass text, hoco text, status text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.nr::text, p.bezeichnung::text, p.mass::text, p.hoco::text, p.status::text
  from public.pruefmittel p
  where p.ort_art = 'schrank'
    and public.darf_schreiben() and not public.ist_extern() and not public.bin_dienst();
$$;

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
  where id = any(p_ids) and ort_art = 'schrank' and coalesce(status, 'aktiv') = 'aktiv';
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.pruefmittel_schrank_lesen() to authenticated;
grant execute on function public.pruefmittel_ausbuchen(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'pruefmittel_schrank_lesen')
             and exists (select 1 from pg_proc where proname = 'pruefmittel_ausbuchen')
       then 'ok' else 'FEHLT' end as probe;
