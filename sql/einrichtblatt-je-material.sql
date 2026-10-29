-- =================================================================
--  Einrichtblätter je Materialgrösse für die SB-20C (Maschine 120)
--  Wunsch Patrick 29. Oktober 2026.
--
--  Legt in app_config die Liste „eb_je_material“ an: für den Typ
--  SB-20C drei Materialgrössen. Hat ein Auftrag auf der SB-20C kein
--  eigenes Einrichtblatt, nimmt die App das Blatt, dessen Merkmal im
--  Material des Auftrags steht. Die Blätter selbst baut man auf der
--  Seite der Maschine 120 in der App.
--  Gefahrlos mehrfach ausführbar: eine vorhandene Liste bleibt.
-- =================================================================
insert into app_config (schluessel, wert)
select 'eb_je_material', json_build_object(t.id::text, json_build_array(
  json_build_object('name', 'Rohr 16.2 x 14.5', 'erkennen', json_build_array('16.2/14.5', 'Ø16')),
  json_build_object('name', 'Rohr 17.2 x 14.5', 'erkennen', json_build_array('17.2/14.5', 'Ø17')),
  json_build_object('name', 'Rohr 12 x 11.2', 'erkennen', json_build_array('12/11.2'))))::text
from machine_types t where t.name = 'SB-20C'
on conflict (schluessel) do nothing;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from app_config where schluessel = 'eb_je_material')
  then 'ok' else 'FEHLT' end as eb_je_material;
