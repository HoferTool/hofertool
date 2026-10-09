-- =================================================================
--  PLANWAND NUR FÜR ADMINS  (seit 1.10.0)
--
--  Was diese Datei macht:
--  Aufträge auf der Planwand anlegen, verschieben (Maschine, Start,
--  Tage) und die HOCO Nr. ändern dürfen nur noch Admins (Wunsch
--  Patrick, 9. Oktober 2026). Auch das Konto Planwand nicht mehr.
--  Alles andere bleibt, wie es ist: Zustand, Problem melden,
--  Stückzahl, Fertigungsmenge in der Produktion, Material und
--  Dokumente, Materialplatz mit Häkchen, Ferien für alle.
--  Das Dienstkonto (Abgleich am Pool-Rechner) und Änderungen im
--  Supabase-Dashboard gehen immer. Löschen konnten schon bisher nur
--  Admins.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

create or replace function public.jobs_planen_recht()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if exists (select 1 from public.profiles
             where id = auth.uid() and is_active = true and role in ('admin', 'dienst')) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Neue Aufträge auf der Planwand legen nur Admins an';
  end if;
  if new.machine_id is distinct from old.machine_id
     or new.planned_from is distinct from old.planned_from
     or new.planned_days is distinct from old.planned_days
     or new.job_number is distinct from old.job_number then
    raise exception 'Die Planwand ändern nur Admins';
  end if;
  return new;
end $$;

drop trigger if exists jobs_planen_recht on public.jobs;
create trigger jobs_planen_recht
  before insert or update of machine_id, planned_from, planned_days, job_number on public.jobs
  for each row execute function public.jobs_planen_recht();

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Schutz der Planwand' as was,
  case when exists (select 1 from pg_trigger where tgname = 'jobs_planen_recht')
       then 'ok' else 'FEHLT' end as stand;
