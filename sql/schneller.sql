-- =================================================================
--  SCHNELLER LADEN
--
--  Zwei Dinge, die das Laden der Planwand beschleunigen:
--
--   1. Die Sperren für Externe fragten bei JEDER Zeile nach, ob die
--      angemeldete Person extern ist — bei 2'300 Aufträgen 2'300 Mal.
--      Jetzt einmal pro Abfrage. An den Regeln selbst ändert sich
--      nichts, sie werden nur schneller ausgewertet.
--
--   2. Zwei Verzeichnisse (Indizes), damit die Datenbank den letzten
--      Zählerstand eines Auftrags und die Aufträge einer Maschine
--      direkt findet, statt alles durchzugehen.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================


-- ---------- 1. Verzeichnisse ----------
create index if not exists idx_production_records_auftrag
  on public.production_records (job_id, record_date desc);
create index if not exists idx_production_records_maschine
  on public.production_records (machine_id, record_date);
create index if not exists idx_jobs_maschine_beginn
  on public.jobs (machine_id, planned_from);


-- ---------- 4. Sperren für Externe ----------
-- "restrictive" heisst: gilt zusätzlich zu allen anderen Regeln. Für
-- alle, die nicht extern sind, ist die Bedingung immer erfüllt.
do $$
declare
  t text;
  gesperrt text[] := array[
    'order_items', 'articles', 'suppliers', 'vacations', 'hoco_parts',
    'hoco_type_data', 'dokumente', 'app_config', 'machine_types', 'tool_changes',
    'setup_sheets', 'setup_sheet_slots', 'shopping_items', 'todos', 'designations',
    'solar_werte', 'farb_material', 'fahrzeuge', 'fahrzeug_buchungen',
    'fahrzeug_probleme', 'chat_gespraeche', 'chat_nachrichten', 'chat_teilnehmer',
    'chat_gelesen', 'storage_locations', 'stock_balances', 'stock_movements',
    'notizen', 'notes', 'personen', 'game_scores', 'eier_zaehler', 'eier_historie',
    'people', 'type_slots', 'type_paths', 'tool_kinds', 'werkzeugwechsel',
    'einrichtblaetter', 'chat'];
begin
  -- Alles Übrige: für Externe ganz gesperrt
  foreach t in array gesperrt loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- Nur echte Tabellen; Sichten sind oben schon an die Regeln gebunden
    if (select relkind from pg_class where oid = ('public.' || t)::regclass) not in ('r', 'p') then
      continue;
    end if;
    execute format('drop policy if exists "extern gesperrt" on public.%I', t);
    execute format('create policy "extern gesperrt" on public.%I as restrictive for all '
                   || 'to authenticated using (not (select public.ist_extern())) '
                   || 'with check (not (select public.ist_extern()))', t);
  end loop;
end $$;

-- Aufträge: nur die auf eigenen Maschinen lesen, nichts anlegen oder löschen
drop policy if exists "extern nur eigene maschinen" on public.jobs;
create policy "extern nur eigene maschinen" on public.jobs as restrictive for select
  to authenticated using (not (select public.ist_extern()) or public.extern_darf_maschine(machine_id));
drop policy if exists "extern aendert keine auftraege" on public.jobs;
create policy "extern aendert keine auftraege" on public.jobs as restrictive for update
  to authenticated using (not (select public.ist_extern())) with check (not (select public.ist_extern()));
drop policy if exists "extern legt keine auftraege an" on public.jobs;
create policy "extern legt keine auftraege an" on public.jobs as restrictive for insert
  to authenticated with check (not (select public.ist_extern()));
drop policy if exists "extern loescht keine auftraege" on public.jobs;
create policy "extern loescht keine auftraege" on public.jobs as restrictive for delete
  to authenticated using (not (select public.ist_extern()));

-- Stückzahlen: lesen und melden, nur für eigene Maschinen
drop policy if exists "extern nur eigene stueckzahlen" on public.production_records;
create policy "extern nur eigene stueckzahlen" on public.production_records as restrictive for all
  to authenticated
  using (not (select public.ist_extern()) or public.extern_darf_maschine(machine_id))
  with check (not (select public.ist_extern()) or public.extern_darf_maschine(machine_id));

-- Maschinen und Parks: nur die eigenen sehen, nichts ändern
drop policy if exists "extern nur eigene maschinen" on public.machines;
create policy "extern nur eigene maschinen" on public.machines as restrictive for select
  to authenticated using (not (select public.ist_extern()) or public.extern_darf_park(park_id));
drop policy if exists "extern aendert keine maschinen" on public.machines;
create policy "extern aendert keine maschinen" on public.machines as restrictive for update
  to authenticated using (not (select public.ist_extern())) with check (not (select public.ist_extern()));
drop policy if exists "extern legt keine maschinen an" on public.machines;
create policy "extern legt keine maschinen an" on public.machines as restrictive for insert
  to authenticated with check (not (select public.ist_extern()));
drop policy if exists "extern loescht keine maschinen" on public.machines;
create policy "extern loescht keine maschinen" on public.machines as restrictive for delete
  to authenticated using (not (select public.ist_extern()));

drop policy if exists "extern nur eigene parks" on public.machine_parks;
create policy "extern nur eigene parks" on public.machine_parks as restrictive for select
  to authenticated using (not (select public.ist_extern()) or public.extern_darf_park(id));
drop policy if exists "extern aendert keine parks" on public.machine_parks;
create policy "extern aendert keine parks" on public.machine_parks as restrictive for update
  to authenticated using (not (select public.ist_extern())) with check (not (select public.ist_extern()));

-- Personen: Externe sehen nur sich selbst
drop policy if exists "extern nur sich selbst" on public.profiles;
create policy "extern nur sich selbst" on public.profiles as restrictive for select
  to authenticated using (not (select public.ist_extern()) or id = auth.uid());
drop policy if exists "extern aendert nur sich selbst" on public.profiles;
create policy "extern aendert nur sich selbst" on public.profiles as restrictive for update
  to authenticated using (not (select public.ist_extern()) or id = auth.uid())
  with check (not (select public.ist_extern()) or (id = auth.uid() and role = 'extern'));


notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Verzeichnis Zählerstände je Auftrag' as punkt,
       case when exists (select 1 from pg_indexes where indexname = 'idx_production_records_auftrag')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Verzeichnis Aufträge je Maschine',
       case when exists (select 1 from pg_indexes where indexname = 'idx_jobs_maschine_beginn')
            then 'ok' else 'FEHLT' end
union all
select 'Sperren werten einmal pro Abfrage aus',
       case when exists (select 1 from pg_policy
                         where polname = 'extern nur eigene maschinen'
                           and polrelid = 'public.jobs'::regclass
                           and pg_get_expr(polqual, polrelid) ilike '%SELECT public.ist_extern()%')
            then 'ok' else 'FEHLT' end;
