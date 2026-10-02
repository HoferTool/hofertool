-- =================================================================
--  EINRICHTBLATT ALS PDF
--
--  Zwei Spalten, mehr braucht es nicht:
--   · machine_types.blatt_url   — die Vorlage je Maschinentyp
--   · hoco_type_data.blatt_url  — das Blatt für genau eine HOCO Nr.
--     auf genau einem Typ; überschreibt die Vorlage
--
--  Dazu abend_stk, damit "Stück am Abend" dort mitläuft, und der
--  eindeutige Schlüssel für hoco_nr + type_id, den das Speichern
--  braucht.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.machine_types   add column if not exists blatt_url text;
alter table public.hoco_type_data  add column if not exists blatt_url text;
alter table public.hoco_type_data  add column if not exists abend_stk integer;

-- Freier Text, der nur im Pad Mode an der Maschine erscheint. Hängt an
-- der HOCO Nr. und am Typ — läuft dasselbe Teil später wieder auf
-- diesem Typ, steht der Hinweis wieder da.
alter table public.hoco_type_data  add column if not exists pad_info text;

-- Je HOCO Nr. und Typ genau eine Zeile
create unique index if not exists idx_hoco_type_data_eindeutig
  on public.hoco_type_data (hoco_nr, type_id);

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'machine_types.blatt_url' as punkt,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'machine_types'
                           and column_name = 'blatt_url') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'hoco_type_data.blatt_url',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'hoco_type_data'
                           and column_name = 'blatt_url') then 'ok' else 'FEHLT' end
union all
select 'hoco_type_data.abend_stk',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'hoco_type_data'
                           and column_name = 'abend_stk') then 'ok' else 'FEHLT' end
union all
select 'hoco_type_data.pad_info',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'hoco_type_data'
                           and column_name = 'pad_info') then 'ok' else 'FEHLT' end
union all
select 'Schlüssel hoco_nr + type_id',
       case when exists (select 1 from pg_indexes
                         where schemaname = 'public'
                           and indexname = 'idx_hoco_type_data_eindeutig')
            then 'ok' else 'FEHLT' end;
