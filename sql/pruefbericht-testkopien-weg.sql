-- Entfernt zwei alte Testkopien von Claude (10844-0049, Seite 1 und 2, ohne Index).
-- Die echten Berichte aus dem Ordner (Index B) bleiben. Mehrfach ausführbar.
delete from pruefbericht_dateien
where id in ('5ce5d427-90ec-467a-97e2-632d6429bee1','eac48835-9812-4bc3-a846-da93a6607a7b');

select case when count(*) = 0 then 'ok' else 'FEHLT' end as probe
from pruefbericht_dateien
where id in ('5ce5d427-90ec-467a-97e2-632d6429bee1','eac48835-9812-4bc3-a846-da93a6607a7b');
