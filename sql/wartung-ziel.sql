-- =================================================================
--  WARTUNG AUCH JE MASCHINE ODER JE MASCHINENPARK
--
--  Ab 1.339.0 lässt sich eine Wartung im Pad Mode nicht nur einem
--  Maschinentyp zuteilen, sondern auch einer einzelnen Maschine oder
--  einem ganzen Maschinenpark (Wunsch Patrick 2. November 2026:
--  „Wartungen sollen auch einzeln pro Maschine und Park zugeteilt
--  werden können“). Quittiert wird weiter je Maschine.
--
--  Was das Skript macht:
--   - wartung_plan bekommt die Spalten machine_id und park_id
--   - type_id darf leer sein
--   - genau eines von Typ, Maschine oder Park muss gesetzt sein
--
--  Läuft gefahrlos mehrfach, nichts wird gelöscht. Am Ende eine Probe.
-- =================================================================

alter table public.wartung_plan add column if not exists machine_id uuid
  references public.machines(id) on delete cascade;
alter table public.wartung_plan add column if not exists park_id uuid
  references public.machine_parks(id) on delete cascade;
alter table public.wartung_plan alter column type_id drop not null;
create index if not exists wartung_plan_maschine on public.wartung_plan (machine_id);
create index if not exists wartung_plan_park on public.wartung_plan (park_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wartung_plan_ein_ziel') then
    alter table public.wartung_plan add constraint wartung_plan_ein_ziel
      check (num_nonnulls(type_id, machine_id, park_id) = 1);
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte machine_id' as punkt,
       case when exists (select 1 from information_schema.columns where table_name = 'wartung_plan' and column_name = 'machine_id')
         then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Spalte park_id',
       case when exists (select 1 from information_schema.columns where table_name = 'wartung_plan' and column_name = 'park_id')
         then 'ok' else 'FEHLT' end
union all
select 'Typ darf leer sein',
       case when (select is_nullable from information_schema.columns where table_name = 'wartung_plan' and column_name = 'type_id') = 'YES'
         then 'ok' else 'FEHLT' end;
