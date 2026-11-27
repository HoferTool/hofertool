-- Fertigungsaufträge im Test ERP aus den Aufträgen der Planwand (Wunsch Patrick
-- 27. November 2026: „wir haben im HoferTool ja WBGs mit FA Nr., das sind
-- Fertigungsaufträge. Erstelle mir die FAs im Test ERP, du hast ja die Arbeitspläne“).
--
-- Was es tut: für jeden Auftrag der Planwand mit FA Nr. (Jahr + 6 Ziffern, wie
-- 2026008598) und einem Hofer-Artikel mit derselben HOCO Nr. entsteht ein
-- Fertigungsauftrag mit genau dieser Nummer:
--   * Kopf: Kunde des Artikels, Datum = geplanter Start, Arbeitsplan des Artikels
--     (je Arbeitsgang abzuhaken), daten.planwand mit Auftrag, Maschine, Stand.
--   * Position 10: der Artikel, Menge = Sollmenge, Index aus der WBG (sonst des
--     Artikels), Termin = geplanter Start plus geplante Arbeitstage (grob).
--   * Fertige Aufträge sind „abgeschlossen“, ihre Arbeitsgänge erledigt am Ende.
-- Es bucht KEINEN Lagerbestand. Einträge ohne gültige FA Nr. (z. B. „ANGEBOT“)
-- bleiben weg. Mehrfach ausführbar: eine FA Nr., die es schon gibt, bleibt unberührt.

insert into public.erp_belege (typ, nr, partner_id, art, status, datum, daten)
select 'fertigung', j.fa_nr, a.kunde_id, 'einzel',
       case when j.plan_status = 'fertig' then 'abgeschlossen' else 'offen' end,
       coalesce(j.planned_from, j.started_at::date, current_date),
       jsonb_build_object(
         'ap', coalesce((select jsonb_agg(x || jsonb_build_object('erledigt_am',
                  case when j.plan_status = 'fertig' then to_jsonb(coalesce(j.ended_at, now())) else 'null'::jsonb end))
                from jsonb_array_elements(coalesce(a.arbeitsplan, '[]'::jsonb)) x), '[]'::jsonb),
         'aus_planwand', true,
         'planwand', jsonb_build_object('job_id', j.id, 'artikel_id', a.id, 'maschine', m.name, 'maschine_nr', m.machine_number,
           'stand', j.plan_status, 'start', j.planned_from, 'tage', j.planned_days, 'beendet', j.ended_at))
from public.jobs j
join lateral (select * from public.erp_artikel a0 where a0.art = 'hofer' and a0.nr = j.job_number
  -- Gibt es die HOCO Nr. doppelt, zählt der mit dem Index der WBG, dann der mit Arbeitsplan, dann der neuste
  order by (a0.idx = j.wbg_index) desc, (jsonb_array_length(coalesce(a0.arbeitsplan, '[]'::jsonb)) > 0) desc, a0.aktiv desc, a0.geaendert_am desc nulls last
  limit 1) a on true
left join public.machines m on m.id = j.machine_id
where j.fa_nr ~ '^20\d{8}$'
  and not exists (select 1 from public.erp_belege b where b.typ = 'fertigung' and b.nr = j.fa_nr);

insert into public.erp_positionen (beleg_id, pos, artikel_id, menge, einheit, termin, daten)
select b.id, 10, a.id, coalesce(j.target_quantity, 0), coalesce(a.einheit, 'Stk'),
       case when j.planned_from is not null
            then j.planned_from + ceil(coalesce(j.planned_days, 1) * 7.0 / 5)::int end,
       jsonb_build_object('idx', case when coalesce(j.wbg_index, '') not in ('', '-', '?') then j.wbg_index else coalesce(a.idx, '') end)
from public.erp_belege b
join public.jobs j on j.fa_nr = b.nr
join public.erp_artikel a on a.id = (b.daten->'planwand'->>'artikel_id')::uuid
where b.typ = 'fertigung' and (b.daten->>'aus_planwand') = 'true'
  and not exists (select 1 from public.erp_positionen p where p.beleg_id = b.id);

notify pgrst, 'reload schema';

select case when (select count(*) from public.erp_belege where typ = 'fertigung' and daten->>'aus_planwand' = 'true')
            = (select count(*) from public.jobs j where j.fa_nr ~ '^20\d{8}$'
                 and exists (select 1 from public.erp_artikel a where a.art = 'hofer' and a.nr = j.job_number))
       then 'ok' else 'FEHLT' end as probe;
