-- =================================================================
--  VORBEREITEN
--
--  Für den Knopf „Vorbereiten“ im Auftragsfenster neben „Problem“
--  (Wunsch Patrick 29. Oktober 2026): eine Checkliste fürs Rüsten mit
--  Material, Spannmitteln und allen Werkzeugen. Jedes abgehakte Feld
--  ist eine Zeile, damit es alle sehen (am PC sieht man, was an der
--  Maschine schon bereit ist). Häkchen weg = Zeile weg.
--   - job_id: der Auftrag
--   - punkt:  was abgehakt ist, etwa „material:wo“, „spannmittel“
--             oder „wz:T1100“
--  Lesen alle Angemeldeten, abhaken alle mit Schreibrecht. Externe
--  (seit 1.272.2, Entscheid Patrick 29. Oktober 2026: „Extern ja“)
--  lesen und haken nur bei Aufträgen auf ihren eigenen Maschinen ab.
--  Wird der Auftrag gelöscht, gehen seine Häkchen mit.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.auftrag_vorbereiten (
  job_id   uuid not null references public.jobs(id) on delete cascade,
  punkt    text not null,
  am       timestamptz not null default now(),
  von      uuid default auth.uid(),
  primary key (job_id, punkt)
);

alter table public.auftrag_vorbereiten enable row level security;
grant select, insert, update, delete on public.auftrag_vorbereiten to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'auftrag_vorbereiten' and policyname = 'vorbereiten lesen') then
    create policy "vorbereiten lesen" on public.auftrag_vorbereiten for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'auftrag_vorbereiten' and policyname = 'vorbereiten abhaken') then
    create policy "vorbereiten abhaken" on public.auftrag_vorbereiten for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'auftrag_vorbereiten' and policyname = 'vorbereiten aendern') then
    create policy "vorbereiten aendern" on public.auftrag_vorbereiten for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'auftrag_vorbereiten' and policyname = 'vorbereiten wegnehmen') then
    create policy "vorbereiten wegnehmen" on public.auftrag_vorbereiten for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
end $$;

-- Die Regeln selbst (auch für schon angelegte, ohne „drop“):
-- intern wie bisher, Externe nur bei Aufträgen ihrer Maschinen
create or replace function public.vorbereiten_darf_sehen(j uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.darf_lesen() and (not public.ist_extern()
    or exists (select 1 from public.jobs x where x.id = j and public.extern_darf_maschine(x.machine_id)))
$$;
create or replace function public.vorbereiten_darf_haken(j uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.darf_schreiben() and not public.ist_extern())
    or (public.ist_extern() and exists (select 1 from public.jobs x
          where x.id = j and public.extern_darf_maschine(x.machine_id)))
$$;
alter policy "vorbereiten lesen" on public.auftrag_vorbereiten using (public.vorbereiten_darf_sehen(job_id));
alter policy "vorbereiten abhaken" on public.auftrag_vorbereiten with check (public.vorbereiten_darf_haken(job_id));
alter policy "vorbereiten aendern" on public.auftrag_vorbereiten
  using (public.vorbereiten_darf_haken(job_id)) with check (public.vorbereiten_darf_haken(job_id));
alter policy "vorbereiten wegnehmen" on public.auftrag_vorbereiten using (public.vorbereiten_darf_haken(job_id));

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'auftrag_vorbereiten')
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'auftrag_vorbereiten') = 4
  and exists (select 1 from pg_proc where proname = 'vorbereiten_darf_haken')
  then 'ok' else 'FEHLT' end as vorbereiten;
