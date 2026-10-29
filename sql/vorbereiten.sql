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
--  Lesen alle Angemeldeten ausser Externen, abhaken alle mit
--  Schreibrecht ausser Externen. Wird der Auftrag gelöscht, gehen
--  seine Häkchen mit.
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

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'auftrag_vorbereiten')
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'auftrag_vorbereiten') = 4
  then 'ok' else 'FEHLT' end as vorbereiten;
