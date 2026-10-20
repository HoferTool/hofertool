-- =================================================================
--  Ecobrass gleich wie Messing (Wunsch Patrick 15. Oktober 2026)
--
--  Ecobrass (Messing ohne Blei) hatte auf der Planwand die Farbe Senf.
--  Neue Aufträge bekommen seit 1.60.0 von selbst Orange wie Messing.
--  Diese Datei färbt die bestehenden Senf-Aufträge auch Orange.
--  Vorher merkt sie sich, welche Aufträge Senf waren (app_config
--  'farbe_senf_vorher_2026_10_15'), damit man es zurückdrehen könnte.
--  "Letzte Änderung" der Aufträge bleibt dabei, wie sie war.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

begin;

insert into app_config (schluessel, wert)
  select 'farbe_senf_vorher_2026_10_15', json_agg(id)::text from jobs where color = 'senf'
  having count(*) > 0
  on conflict (schluessel) do nothing;

alter table jobs disable trigger jobs_geaendert;
update jobs set color = 'orange' where color = 'senf';
alter table jobs enable trigger jobs_geaendert;

commit;

notify pgrst, 'reload schema';

-- Probe
select case when not exists (select 1 from jobs where color = 'senf')
  then 'ok' else 'FEHLT' end as ecobrass_wie_messing;
