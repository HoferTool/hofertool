-- Offene Fremdleistungen aus dem Gewatec-Export als Bestellungen im Test ERP
-- (Patrick 27. November 2026: „ich sehe in Bestellungen nur Bestellungen für
-- Rohmaterial, keine Fremdleistungen“).
--
-- Warum sie fehlten: die Übernahme vom 25. November 2026 nahm nur Bestell-
-- positionen, bei denen noch Menge offen war (Liefermenge < Menge). Bei einer
-- Fremdleistung (Hofer-Artikel geht zur Zusatzbearbeitung zum Lieferanten)
-- steht im Gewatec die Liefermenge aber gleich der Menge, solange sie offen ist.
-- Darum zählt hier „nicht erledigt“ (Erledigt = 0) und nicht deaktiviert.
--
-- Quelle: imp_roh (vBestellung, vBestellPosition, vBestellLieferFaelligkeit),
-- Lieferant über anschr_map (Anschrift → Lieferanten-Nr.), Artikel über imp_art.
-- Daten nur in der Datenbank. Mehrfach ausführbar: vorhandene Bestell-Nr. bleiben.

with pos as (
  select p.daten d, ia.artikel_id, a.idx, a.einheit
  from public.imp_roh p
  join public.imp_art ia on ia.gid = p.daten->>'ArtikelID'
  join public.erp_artikel a on a.id = ia.artikel_id and a.art = 'hofer'
  where p.quelle = 'vBestellPosition' and p.daten->>'Erledigt' = '0'
), kopf as (
  select distinct on (k.daten->>'BestellIDIntern') k.daten d
  from public.imp_roh k
  where k.quelle = 'vBestellung' and coalesce(k.daten->>'Deaktiv', '0') = '0'
    and exists (select 1 from pos where pos.d->>'BestellIDIntern' = k.daten->>'BestellIDIntern')
    and not exists (select 1 from public.erp_belege b where b.typ = 'bestellung' and b.nr = k.daten->>'BestellIDIntern')
)
insert into public.erp_belege (typ, nr, partner_id, art, status, datum, daten)
select 'bestellung', kopf.d->>'BestellIDIntern',
  (select pa.id from public.erp_partner pa where pa.art = 'lieferant'
     and pa.nr = (select m.daten->>'l' from public.imp_roh m where m.quelle = 'anschr_map' and m.daten->>'a' = kopf.d->>'Anschrift' limit 1) limit 1),
  'einzel', 'offen', left(kopf.d->>'Bestelldatum', 10)::date,
  jsonb_build_object('quelle', 'Gewatec Fremdleistung 27.11.2026', 'fremdleistung', true,
    'gewatec', kopf.d, 'zeichen', kopf.d->>'UnsereZeichen')
from kopf;

with pos as (
  select p.daten d, ia.artikel_id, a.idx, a.einheit
  from public.imp_roh p
  join public.imp_art ia on ia.gid = p.daten->>'ArtikelID'
  join public.erp_artikel a on a.id = ia.artikel_id and a.art = 'hofer'
  where p.quelle = 'vBestellPosition' and p.daten->>'Erledigt' = '0'
)
insert into public.erp_positionen (beleg_id, pos, artikel_id, text, menge, einheit, preis, termin, termin_kw, daten)
select b.id, coalesce(nullif(p.d->>'BestellPosNr', '')::int, 1) * 10, p.artikel_id, p.d->>'artikelcode',
  nullif(p.d->>'Menge', '')::numeric, coalesce(nullif(p.d->>'lieferkuerzel', ''), p.einheit, 'Stk'),
  nullif(p.d->>'Preis', '')::numeric, left(f.d->>'Faelligkeitsdatum', 10)::date, f.d->>'FaelligkeitsKW',
  jsonb_build_object('pe', coalesce(nullif(p.d->>'PEinheit', '')::numeric, 1), 'idx', coalesce(p.idx, ''),
    'abrufe', case when f.d is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('kw', f.d->>'FaelligkeitsKW',
      'menge', nullif(f.d->>'Faelligkeitsmenge', '')::numeric, 'termin', left(f.d->>'Faelligkeitsdatum', 10), 'bemerkung', '')) end,
    'gewatec', p.d, 'bestellt', nullif(p.d->>'Menge', '')::numeric, 'geliefert_gewatec', 0, 'fremdleistung', true)
from pos p
join public.erp_belege b on b.typ = 'bestellung' and b.nr = p.d->>'BestellIDIntern' and (b.daten->>'fremdleistung') = 'true'
left join lateral (select x.daten d from public.imp_roh x where x.quelle = 'vBestellLieferFaelligkeit'
   and x.daten->>'BestellPosition' = p.d->>'BestellPosition' and coalesce(x.daten->>'Erledigt', '0') = '0'
   order by (x.daten->>'Aktuell') desc, x.daten->>'AktualisierungsDatum' desc limit 1) f on true
where not exists (select 1 from public.erp_positionen q where q.beleg_id = b.id and q.pos = coalesce(nullif(p.d->>'BestellPosNr', '')::int, 1) * 10);

notify pgrst, 'reload schema';

select case when exists (select 1 from public.erp_belege where typ = 'bestellung' and daten->>'fremdleistung' = 'true')
  then 'ok' else 'FEHLT' end as probe,
  (select count(*) from public.erp_belege where typ = 'bestellung' and daten->>'fremdleistung' = 'true') bestellungen,
  (select count(*) from public.erp_positionen q join public.erp_belege b on b.id = q.beleg_id where b.daten->>'fremdleistung' = 'true') positionen,
  (select count(*) from public.erp_belege where typ = 'bestellung' and daten->>'fremdleistung' = 'true' and partner_id is null) ohne_lieferant;
