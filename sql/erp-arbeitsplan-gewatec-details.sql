-- Arbeitsplan-Details aus dem Gewatec in die Hofer-Artikel und Fertigungsaufträge
-- (Patrick 27. November 2026: „im Gewatec waren da Informationen drin wie Maschine,
-- Rüstzeiten, Stückzeiten etc., bei ZA extern Positionen auch Lieferanten mit
-- Pauschalzeiten“, „nicht aus den Kalkulationen, ich brauche es aus den Arbeitsplänen“).
--
-- Quelle: Gewatec-Export 4 (Ansichten vArbeitsplanPosArbeitsgIntDet und
-- vKLKArbeitsplanPosExt), zusammengefasst je Arbeitsplan-Position in imp_roh
-- (quelle = 'apos_detail': p = ArbeitsplanPos, m = Arbeitsplatz, te = Stückzeit in s
-- je Stück, ru = Rüstzeit in h, lc = Lieferanten-Nr., pz/pe = Pauschalzeit und Einheit).
-- Zuordnung: Artikel.daten.gewatec_id → vArbeitsplan (aktiver, sonst neuester) →
-- vArbeitsplanPos mit gleicher Position (pos = Position × 10) und gleichem AG-Code.
-- Nur leere Felder werden gefüllt, von Hand Eingetragenes bleibt. Danach die
-- Arbeitsgänge der FAs aus dem Artikel, ebenfalls nur leere Felder.
-- Mehrfach ausführbar.

with plan as (
  select distinct on (r.daten->>'MutterArtikelID') r.daten->>'MutterArtikelID' mid, r.daten->>'Arbeitsplan' ap
  from public.imp_roh r where r.quelle = 'vArbeitsplan'
  order by r.daten->>'MutterArtikelID', (r.daten->>'Aktiv') = '1' desc, (r.daten->>'Arbeitsplan')::int desc
), apos as (
  select p.daten->>'Arbeitsplan' ap, (p.daten->>'Position')::int * 10 pos, p.daten->>'AGCode' code, d.daten det
  from public.imp_roh p join public.imp_roh d on d.quelle = 'apos_detail' and d.daten->>'p' = p.daten->>'ArbeitsplanPos'
  where p.quelle = 'vArbeitsplanPos'
), el as (
  select a.id, e.o, e.el, x.det, l.name lname
  from public.erp_artikel a
  join plan on plan.mid = a.daten->>'gewatec_id'
  cross join lateral jsonb_array_elements(a.arbeitsplan) with ordinality e(el, o)
  left join apos x on x.ap = plan.ap and x.pos = (e.el->>'pos')::int
    and x.code = coalesce(nullif(e.el->>'ag_code', ''), e.el->>'code')
  left join public.erp_partner l on l.art = 'lieferant' and l.nr = x.det->>'lc'
  where a.art = 'hofer' and jsonb_typeof(a.arbeitsplan) = 'array' and jsonb_array_length(a.arbeitsplan) > 0
), neu as (
  select id, jsonb_agg(case when det is null then el else
    jsonb_strip_nulls(jsonb_build_object(
      'maschine', case when det ? 'lc' then coalesce(lname, det->>'lc') else det->>'m' end,
      'te', (det->>'te')::numeric, 'ruest', (det->>'ru')::numeric,
      'lieferant_nr', det->>'lc', 'pauschal', (det->>'pz')::numeric, 'pauschal_einheit', det->>'pe',
      'gewatec_pos', det->>'p'))
    || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(el) w(k, v)
        where v not in ('""'::jsonb, 'null'::jsonb, '0'::jsonb))
    end order by o) ap
  from el group by id
)
update public.erp_artikel a set arbeitsplan = neu.ap, geaendert_am = now()
from neu where a.id = neu.id and a.arbeitsplan is distinct from neu.ap;

-- Fertigungsaufträge: Arbeitsgang mit gleicher Pos und gleichem AG-Code im Artikel
with fa as (
  select b.id, b.daten, e.o, e.el, x.el art_el
  from public.erp_belege b
  join lateral (select q.artikel_id from public.erp_positionen q where q.beleg_id = b.id and q.artikel_id is not null order by q.pos limit 1) q on true
  join public.erp_artikel a on a.id = q.artikel_id
  cross join lateral jsonb_array_elements(b.daten->'ap') with ordinality e(el, o)
  left join lateral (select y el from jsonb_array_elements(a.arbeitsplan) y
    where (y->>'pos') = (e.el->>'pos') and coalesce(nullif(y->>'ag_code', ''), y->>'code', '') = coalesce(nullif(e.el->>'ag_code', ''), e.el->>'code', '') limit 1) x on true
  where b.typ = 'fertigung' and jsonb_typeof(b.daten->'ap') = 'array' and jsonb_typeof(a.arbeitsplan) = 'array'
), neu as (
  select id, jsonb_agg(case when art_el is null then el else
    (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(art_el) w(k, v)
      where k in ('maschine', 'te', 'ruest', 'lieferant_nr', 'pauschal', 'pauschal_einheit', 'gewatec_pos'))
    || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(el) w(k, v)
        where v not in ('""'::jsonb, 'null'::jsonb, '0'::jsonb))
    end order by o) ap
  from fa group by id
)
update public.erp_belege b set daten = jsonb_set(b.daten, '{ap}', neu.ap), geaendert_am = now()
from neu where b.id = neu.id and b.daten->'ap' is distinct from neu.ap;

notify pgrst, 'reload schema';

select case when exists (select 1 from public.erp_artikel a, jsonb_array_elements(a.arbeitsplan) e where a.art = 'hofer' and e ? 'gewatec_pos')
  then 'ok' else 'FEHLT' end as probe,
  (select count(distinct a.id) from public.erp_artikel a, jsonb_array_elements(a.arbeitsplan) e where a.art = 'hofer' and e ? 'gewatec_pos') artikel,
  (select count(*) from public.erp_artikel a, jsonb_array_elements(a.arbeitsplan) e where a.art = 'hofer' and e ? 'gewatec_pos') arbeitsgaenge,
  (select count(*) from public.erp_artikel a, jsonb_array_elements(a.arbeitsplan) e where a.art = 'hofer' and e ? 'pauschal') extern_mit_pauschal,
  (select count(*) from public.erp_belege b, jsonb_array_elements(b.daten->'ap') e where b.typ = 'fertigung' and e ? 'gewatec_pos') fa_arbeitsgaenge;
