-- =================================================================
--  GEO-OFFSET AUS DER NC-DATEI INS EINRICHTBLATT (1.276.0,
--  Wunsch Patrick 30. Oktober 2026)
--
--  Bei SW-Typen trägt man im Fenster „⚙ Typ“ den Ordner der
--  NC-Programme ein (machine_types.nc_ordner). Das Programm
--  nc-geo.ps1 am Pool-Rechner liest dort alle Dateien, deren Name mit 4
--  beginnt (4234, O4234 …: das Programm mit den Geometriedaten), und
--  legt ihren Text unverändert in die Tabelle nc_geo. Die App setzt ihn
--  im Einrichtblatt als Seite 2 „GEO-OFFSET“ ein.
--
--    nc_geo       je Typ und Programm-Nr. (4234) der Text der Datei
--    nc_geo_status  in app_config: was das Programm zuletzt gesehen hat
--
--  Lesen: alle, die lesen dürfen, ausser Externen. Schreiben: nur das
--  Dienstkonto (das Programm) und Admins.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.machine_types add column if not exists nc_ordner text;

create table if not exists public.nc_geo (
  type_id     uuid not null references public.machine_types(id) on delete cascade,
  nr          text not null,
  datei       text,
  inhalt      text not null default '',
  geaendert   timestamptz,
  gelesen_am  timestamptz not null default now(),
  primary key (type_id, nr)
);
alter table public.nc_geo enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'nc_geo' and policyname = 'lesen') then
    create policy "lesen" on public.nc_geo for select to authenticated
      using ((select public.darf_lesen()) and not (select public.ist_extern()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'nc_geo' and policyname = 'dienst schreibt') then
    create policy "dienst schreibt" on public.nc_geo for all to authenticated
      using ((select public.bin_dienst()) or (select public.bin_admin()))
      with check ((select public.bin_dienst()) or (select public.bin_admin()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'dienst meldet nc geo') then
    create policy "dienst meldet nc geo" on public.app_config for all to authenticated
      using (schluessel = 'nc_geo_status' and (select public.bin_dienst()))
      with check (schluessel = 'nc_geo_status' and (select public.bin_dienst()));
  end if;
end $$;

grant select, insert, update, delete on public.nc_geo to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte nc_ordner' as was,
       case when exists (select 1 from information_schema.columns where table_name = 'machine_types'
                         and column_name = 'nc_ordner') then 'ok' else 'FEHLT' end as stand
union all select 'Tabelle nc_geo',
       case when exists (select 1 from pg_policies where tablename = 'nc_geo' and policyname = 'dienst schreibt')
            then 'ok' else 'FEHLT' end
union all select 'Stand melden',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'dienst meldet nc geo') then 'ok' else 'FEHLT' end;
