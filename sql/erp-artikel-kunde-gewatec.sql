-- Kunde bei den Hofer-Artikeln aus dem Gewatec nachtragen (Patrick 27. November 2026:
-- „warum haben die Artikel keinen Kunden?“, gewählt: „Ja, alle 2'039 Artikel“).
-- Die Artikelliste vom 25. November 2026 übernahm den Kunden nicht, obwohl er im
-- Gewatec (vArtikel.Kundenstamm) steht. Zuordnung: Artikel.daten.gewatec_id →
-- imp_roh vArtikel.ArtikelID → Kundenstamm → erp_partner (Kunde) mit gleicher gewatec_id.
-- Nur leere Felder werden gefüllt; dazu die FAs ohne Kunden vom Artikel.
-- Mehrfach ausführbar.

update public.erp_artikel a set kunde_id = pa.id, geaendert_am = now()
from public.imp_roh r, public.erp_partner pa
where a.art = 'hofer' and a.kunde_id is null
  and r.quelle = 'vArtikel' and r.daten->>'ArtikelID' = a.daten->>'gewatec_id'
  and coalesce(r.daten->>'Kundenstamm', '') not in ('', '0')
  and pa.art = 'kunde' and pa.daten->>'gewatec_id' = r.daten->>'Kundenstamm';

update public.erp_belege b set partner_id = a.kunde_id, geaendert_am = now()
from public.erp_positionen p, public.erp_artikel a
where b.typ = 'fertigung' and b.partner_id is null
  and p.beleg_id = b.id and a.id = p.artikel_id and a.kunde_id is not null;

notify pgrst, 'reload schema';

select case when (select count(*) from public.erp_belege where typ = 'fertigung' and partner_id is null) = 0 then 'ok' else 'FEHLT' end as probe,
  (select count(*) from public.erp_artikel where art = 'hofer' and kunde_id is null) artikel_ohne_kunde,
  (select count(*) from public.erp_belege where typ = 'fertigung' and partner_id is null) fa_ohne_kunde;
