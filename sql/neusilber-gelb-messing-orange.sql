-- =================================================================
--  NEUSILBER GELB, MESSING ORANGE
--
--  Entscheid 5. Oktober 2026: Neusilber hat die Farbe Gelb, Messing
--  Orange, so wie es unter Einstellungen -> Farben und Material
--  steht. Die App hat es bis 111.45.0 umgekehrt gemacht. Dieses
--  Skript stellt die bestehenden Aufträge um:
--
--    Material Neusilber (CuNi...)              -> Gelb
--    Material Messing (CuZn..., mit Blei)      -> Orange
--    Material Messing ohne Blei (Ecobrass ...) -> Senf
--    ohne erkennbares Material: Orange und Gelb werden getauscht
--
--  Betroffen sind nur Aufträge, die heute Orange, Gelb oder Senf
--  sind. "Zuletzt geändert von" bleibt, wie es ist. Nur einmal
--  ausführen: ein zweites Mal würde Aufträge ohne Material wieder
--  zurücktauschen.
-- =================================================================

update jobs
set color = case
    when material_bez ~* 'cuni|neusilber|arcap'                then 'gelb'
    when material_bez ~* 'eco ?bra|cuzn21si3|ohne ?pb'         then 'senf'
    when material_bez ~* 'cuzn|messing|\mms ?58'               then 'orange'
    when color = 'orange'                                      then 'gelb'
    when color = 'gelb'                                        then 'orange'
    else color
  end
where color in ('orange', 'gelb', 'senf');

notify pgrst, 'reload schema';

-- Probe: ok, wenn kein Neusilber mehr orange und kein Messing mehr gelb ist
select case when count(*) = 0 then 'ok' else 'FEHLT: ' || count(*) || ' Aufträge' end as probe
from jobs
where (color = 'orange' and material_bez ~* 'cuni|neusilber|arcap')
   or (color = 'gelb' and material_bez ~* 'cuzn|messing|\mms ?58'
       and not material_bez ~* 'eco ?bra|cuzn21si3|ohne ?pb');
