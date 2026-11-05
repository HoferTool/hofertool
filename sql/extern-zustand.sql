-- Externe dürfen den Zustand ihrer Aufträge ändern
-- (Wunsch Patrick 5. November 2026: „externe müssen status ändern können
-- z.B. fertig oder läuft“)
--
-- Bisher durfte ein externes Konto (Firma Zurbrügg) an Aufträgen gar
-- nichts ändern. Jetzt:
--   * nur Aufträge an Maschinen seiner eigenen Parks,
--   * und dort nur den Zustand (geplant, Rüsten, läuft, fertig) samt
--     Start- und Endzeit, die zum Zustand gehören.
-- Alles andere am Auftrag (Menge, Notiz, Material, Planung …) lehnt die
-- Datenbank für Externe weiter ab. Anlegen und Löschen bleibt gesperrt.
--
-- Gefahrlos mehrfach ausführbar, ohne drop.

-- 1. Ändern nur an eigenen Maschinen (vorher: gar nicht)
alter policy "extern aendert keine auftraege" on public.jobs
  using ((not (select public.ist_extern())) or public.extern_darf_maschine(machine_id))
  with check ((not (select public.ist_extern())) or public.extern_darf_maschine(machine_id));

-- 2. Und dort nur die Spalten des Zustands
create or replace function public.jobs_extern_nur_zustand()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  frei text[] := array['plan_status', 'started_at', 'ended_at', 'ended_by',
                       'geaendert_von', 'geaendert_am', 'updated_at'];
begin
  if auth.uid() is null or not public.ist_extern() then return new; end if;
  if (to_jsonb(new) - frei) is distinct from (to_jsonb(old) - frei) then
    raise exception 'Externe dürfen am Auftrag nur den Zustand ändern';
  end if;
  return new;
end $$;

create or replace trigger jobs_extern_nur_zustand
  before update on public.jobs
  for each row execute function public.jobs_extern_nur_zustand();

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from pg_trigger where tgname = 'jobs_extern_nur_zustand')
             and exists (select 1 from pg_policies where tablename = 'jobs'
                         and policyname = 'extern aendert keine auftraege'
                         and qual like '%extern_darf_maschine%')
            then 'ok' else 'FEHLT' end as probe;
