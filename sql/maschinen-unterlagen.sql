-- =================================================================
--  UNTERLAGEN ZU DEN MASCHINEN
--
--  Handbücher, Elektroschemas, Hydraulik- und Pneumatikpläne,
--  Ersatzteillisten und Ähnliches zu jeder Maschine (Wunsch Patrick
--  19. Oktober 2026). Eine Unterlage gehört entweder zu einer
--  einzelnen Maschine (etwa ihr Elektroschema) oder zu einem
--  Maschinentyp, dann sehen sie alle Maschinen dieses Typs (etwa das
--  Handbuch der Star SR-20).
--
--  Was das Skript macht:
--   - neue Tabelle maschinen_unterlagen (Art, Titel, Datei, zu welcher
--     Maschine oder welchem Typ, wer und wann)
--   - lesen dürfen alle Angemeldeten ausser Externen
--   - hochladen, umbenennen und löschen dürfen nur Admins
--  Die Dateien liegen in der Ablage „zeichnungen“ im Ordner
--  „maschinen/“. Sie kommen mit in die tägliche Sicherung.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.maschinen_unterlagen (
  id           uuid primary key default gen_random_uuid(),
  machine_id   uuid references public.machines(id) on delete cascade,
  type_id      uuid references public.machine_types(id) on delete cascade,
  art          text not null default 'sonstiges',
  titel        text not null,
  url          text not null,
  pfad         text,
  dateiname    text,
  groesse      bigint,
  erstellt_am  timestamptz not null default now(),
  erstellt_von uuid default auth.uid(),
  constraint maschinen_unterlagen_ziel check (machine_id is not null or type_id is not null)
);
create index if not exists maschinen_unterlagen_maschine on public.maschinen_unterlagen (machine_id);
create index if not exists maschinen_unterlagen_typ on public.maschinen_unterlagen (type_id);

alter table public.maschinen_unterlagen enable row level security;
grant select, insert, update, delete on public.maschinen_unterlagen to authenticated;

-- Regeln nur anlegen, wenn sie fehlen (ohne „drop“, damit das Skript
-- auch über die Supabase-Verbindung ohne Rückfrage läuft)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_unterlagen' and policyname = 'unterlagen lesen') then
    create policy "unterlagen lesen" on public.maschinen_unterlagen for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_unterlagen' and policyname = 'unterlagen anlegen') then
    create policy "unterlagen anlegen" on public.maschinen_unterlagen for insert to authenticated
      with check ((select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_unterlagen' and policyname = 'unterlagen aendern') then
    create policy "unterlagen aendern" on public.maschinen_unterlagen for update to authenticated
      using ((select public.bin_admin())) with check ((select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'maschinen_unterlagen' and policyname = 'unterlagen loeschen') then
    create policy "unterlagen loeschen" on public.maschinen_unterlagen for delete to authenticated
      using ((select public.bin_admin()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Tabelle maschinen_unterlagen' as punkt,
       case when to_regclass('public.maschinen_unterlagen') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regeln (4)',
       case when (select count(*) from pg_policies where schemaname = 'public'
         and tablename = 'maschinen_unterlagen') >= 4 then 'ok' else 'FEHLT' end;
