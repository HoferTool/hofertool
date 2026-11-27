-- Rahmenaufträge aus dem Gewatec erkennen (Patrick 27. November 2026: „alle Termine, die auf
-- 31.12 stehen, egal welches Jahr, sind Rahmenaufträge. Diese Liefertermine sind die noch offenen
-- Mengen und müssen auf Abruf gesetzt werden.“)
-- 1. Fälligkeiten im Lieferplan mit Termin 31.12.: auf Abruf (abruf = true), Termin leer,
--    das alte Datum bleibt als „bis“.
-- 2. Positionen ohne Lieferplan mit Termin 31.12.: bekommen eine Fälligkeit „auf Abruf“ über die
--    ganze Menge (bis = Termin).
-- 3. Aufträge mit solchen Positionen werden Rahmenaufträge (art = 'rahmen').
-- Mehrfach ausführbar: schon gesetzte Fälligkeiten bleiben, wie sie sind.

update public.erp_positionen q set daten = jsonb_set(q.daten, '{abrufe}', (
    select jsonb_agg(case when substr(e->>'termin', 6, 5) = '12-31'
      then e || jsonb_build_object('abruf', true, 'bis', e->>'termin', 'termin', '', 'kw', '') else e end order by o)
    from jsonb_array_elements(q.daten->'abrufe') with ordinality x(e, o))), geaendert_am = now()
from public.erp_belege b
where b.id = q.beleg_id and b.typ = 'auftrag' and jsonb_typeof(q.daten->'abrufe') = 'array'
  and exists (select 1 from jsonb_array_elements(q.daten->'abrufe') e where substr(e->>'termin', 6, 5) = '12-31');

update public.erp_positionen q set daten = coalesce(q.daten, '{}'::jsonb) || jsonb_build_object('abrufe', jsonb_build_array(
    jsonb_build_object('termin', '', 'kw', '', 'abruf', true, 'bis', to_char(q.termin, 'YYYY-MM-DD'), 'menge', q.menge, 'bemerkung', ''))),
  geaendert_am = now()
from public.erp_belege b
where b.id = q.beleg_id and b.typ = 'auftrag' and to_char(q.termin, 'MM-DD') = '12-31'
  and coalesce(jsonb_array_length(case when jsonb_typeof(q.daten->'abrufe') = 'array' then q.daten->'abrufe' end), 0) = 0;

update public.erp_belege b set art = 'rahmen', geaendert_am = now()
where b.typ = 'auftrag' and coalesce(b.art, '') <> 'rahmen'
  and exists (select 1 from public.erp_positionen q, jsonb_array_elements(case when jsonb_typeof(q.daten->'abrufe') = 'array' then q.daten->'abrufe' else '[]'::jsonb end) e
    where q.beleg_id = b.id and (e->>'abruf') = 'true');

notify pgrst, 'reload schema';

select case when not exists (select 1 from public.erp_positionen q join public.erp_belege b on b.id = q.beleg_id and b.typ = 'auftrag',
    jsonb_array_elements(case when jsonb_typeof(q.daten->'abrufe') = 'array' then q.daten->'abrufe' else '[]'::jsonb end) e
    where substr(e->>'termin', 6, 5) = '12-31') then 'ok' else 'FEHLT' end as probe,
  (select count(*) from public.erp_belege where typ = 'auftrag' and art = 'rahmen') rahmenauftraege,
  (select count(*) from public.erp_positionen q, jsonb_array_elements(case when jsonb_typeof(q.daten->'abrufe') = 'array' then q.daten->'abrufe' else '[]'::jsonb end) e
    where (e->>'abruf') = 'true') auf_abruf;
