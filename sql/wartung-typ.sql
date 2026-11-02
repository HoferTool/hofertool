-- =================================================================
--  WARTUNG JE MASCHINENTYP MIT WIEDERHOLUNG
--
--  Ab 1.338.0 gehört eine Wartung im Pad Mode nicht mehr zu einer
--  einzelnen Maschine, sondern zu einem Maschinentyp, und sie kann sich
--  wiederholen (täglich, wöchentlich, monatlich, jährlich …), Wunsch
--  Patrick 2. November 2026. Quittiert („Erledigt“) wird weiter je
--  Maschine: jede Maschine des Typs zeigt die Wartung, bis sie dort
--  erledigt ist; beim nächsten Termin kommt sie wieder.
--
--  Was das Skript macht:
--   - neue Tabelle wartung_plan (Typ, Titel, Datei, erster Termin,
--     Wiederholung)
--   - neue Tabelle wartung_erledigt (welche Maschine wann erledigt hat)
--   - übernimmt die Einträge aus pad_wartungen (1.337.0) einmal zum
--     Typ ihrer Maschine; pad_wartungen bleibt unbenutzt stehen
--   - lesen und quittieren alle ausser Externen, anlegen, ändern und
--     löschen alle mit Schreibrecht
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe.
-- =================================================================

create table if not exists public.wartung_plan (
  id           uuid primary key default gen_random_uuid(),
  type_id      uuid not null references public.machine_types(id) on delete cascade,
  titel        text not null,
  url          text not null,
  pfad         text,
  dateiname    text,
  art          text not null default 'bild',
  termin       timestamptz,
  wiederholung text not null default 'nie',
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  alt_id       uuid unique
);
create index if not exists wartung_plan_typ on public.wartung_plan (type_id);

create table if not exists public.wartung_erledigt (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.wartung_plan(id) on delete cascade,
  machine_id   uuid not null references public.machines(id) on delete cascade,
  erledigt_am  timestamptz not null default now(),
  erledigt_von uuid default auth.uid()
);
create index if not exists wartung_erledigt_plan on public.wartung_erledigt (plan_id, machine_id);

alter table public.wartung_plan enable row level security;
alter table public.wartung_erledigt enable row level security;
grant select, insert, update, delete on public.wartung_plan to authenticated;
grant select, insert, update, delete on public.wartung_erledigt to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'wartung_plan' and policyname = 'plan lesen') then
    create policy "plan lesen" on public.wartung_plan for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_plan' and policyname = 'plan anlegen') then
    create policy "plan anlegen" on public.wartung_plan for insert to authenticated
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_plan' and policyname = 'plan aendern') then
    create policy "plan aendern" on public.wartung_plan for update to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()))
      with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_plan' and policyname = 'plan loeschen') then
    create policy "plan loeschen" on public.wartung_plan for delete to authenticated
      using ((select public.darf_schreiben()) and not (select public.ist_extern()));
  end if;
  -- Quittieren darf jeder, der sie sieht (auch Mitarbeiter am Pad)
  if not exists (select 1 from pg_policies where tablename = 'wartung_erledigt' and policyname = 'erledigt lesen') then
    create policy "erledigt lesen" on public.wartung_erledigt for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'wartung_erledigt' and policyname = 'erledigt anlegen') then
    create policy "erledigt anlegen" on public.wartung_erledigt for insert to authenticated
      with check ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  -- Löschen nur für Rückgängig: eigene oder mit Schreibrecht
  if not exists (select 1 from pg_policies where tablename = 'wartung_erledigt' and policyname = 'erledigt loeschen') then
    create policy "erledigt loeschen" on public.wartung_erledigt for delete to authenticated
      using (((select public.darf_schreiben()) or erledigt_von = (select auth.uid())) and not (select public.ist_extern()));
  end if;
end $$;

-- Einträge aus 1.337.0 einmal übernehmen (alt_id verhindert Doppelte)
insert into public.wartung_plan (type_id, titel, url, pfad, dateiname, art, termin, erstellt_am, erstellt_von, alt_id)
select m.type_id, w.titel, w.url, w.pfad, w.dateiname, w.art, w.termin, w.erstellt_am, w.erstellt_von, w.id
from public.pad_wartungen w join public.machines m on m.id = w.machine_id
where m.type_id is not null
  and not exists (select 1 from public.wartung_plan p where p.alt_id = w.id);

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle wartung_plan' as punkt,
       case when to_regclass('public.wartung_plan') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Tabelle wartung_erledigt',
       case when to_regclass('public.wartung_erledigt') is not null then 'ok' else 'FEHLT' end
union all
select 'Regeln (7)',
       case when (select count(*) from pg_policies where tablename in ('wartung_plan', 'wartung_erledigt')) >= 7
         then 'ok' else 'FEHLT' end;
