-- =================================================================
--  MATERIAL ZUWEISEN (seit 1.71.0, Wunsch Patrick 15. Oktober 2026)
--  Ein Posten (da, bestellt oder an der Maschine) kann einem Auftrag
--  gehören. Dafür gibt es schon job_id. Neu:
--    fuer_hoco  bei einem Rahmenauftrag: der Posten gehört allen
--               Aufträgen dieser HOCO Nr., bis keiner mehr offen ist
--    platz      wo genau das Material liegt (Pflicht beim Zuweisen)
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.material_posten add column if not exists fuer_hoco text;
alter table public.material_posten add column if not exists platz text;

notify pgrst, 'reload schema';

-- Probe
select 'material_posten.' || s || case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'material_posten' and column_name = s) then ' ok' else ' FEHLT' end
from unnest(array['fuer_hoco', 'platz']) s;
