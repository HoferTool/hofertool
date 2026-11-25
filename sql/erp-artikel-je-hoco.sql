-- Test ERP: pro HOCO Nr. nur noch ein Artikel (Wunsch Patrick 25. November 2026:
-- „es kann pro hoco nr nur einen artikel geben“).
--
-- Was diese Datei tut:
-- 1. Jede Lagerbewegung merkt sich neu selbst ihren Index (Spalte idx). So bleibt
--    der Bestand je Index getrennt, auch wenn der Artikel später einen neuen Index
--    bekommt.
-- 2. Gibt es zu einer HOCO Nr. mehrere Hofer-Artikel, bleibt der mit den meisten
--    Angaben (Kalkulation, Kunde, Bewegungen). Leere Felder füllt er aus dem
--    anderen, die anderen Indexe kommen in seinen Verlauf (daten.indexe),
--    Bewegungen und Positionen zeigen auf ihn, die anderen Zeilen werden gelöscht.
-- 3. Die Datenbank lässt danach keinen zweiten Hofer-Artikel mit derselben Nr. zu.
--
-- Gefahrlos mehrfach ausführbar.

alter table erp_bewegungen add column if not exists idx text;

update erp_bewegungen b set idx = a.idx
  from erp_artikel a
 where a.id = b.artikel_id and b.idx is null;

do $$
declare
  g record;
  behalten uuid;
  k erp_artikel;
  o erp_artikel;
  verlauf jsonb;
begin
  for g in select nr from erp_artikel where art = 'hofer' group by nr having count(*) > 1 loop
    select a.id into behalten from erp_artikel a
     where a.art = 'hofer' and a.nr = g.nr
     order by (a.kalkulation_id is not null) desc, (a.kunde_id is not null) desc,
              (select count(*) from erp_bewegungen b where b.artikel_id = a.id) desc,
              (a.daten ? 'aus_artikelliste') asc, a.erstellt_am asc
     limit 1;
    select * into k from erp_artikel where id = behalten;
    verlauf := coalesce(k.daten->'indexe', '[]'::jsonb);
    for o in select * from erp_artikel where art = 'hofer' and nr = g.nr and id <> behalten loop
      if coalesce(o.idx, '') <> '' and coalesce(o.idx, '') <> coalesce(k.idx, '') then
        verlauf := verlauf || jsonb_build_object('idx', o.idx, 'am', to_char(o.erstellt_am, 'YYYY-MM-DD'), 'notiz', 'zusammengelegt');
      end if;
      if coalesce(k.idx, '') = '' then k.idx := coalesce(o.idx, ''); end if;
      k.bezeichnung := coalesce(nullif(k.bezeichnung, ''), o.bezeichnung);
      k.zeichnung := coalesce(nullif(k.zeichnung, ''), o.zeichnung);
      k.kunde_id := coalesce(k.kunde_id, o.kunde_id);
      k.preis := coalesce(k.preis, o.preis);
      k.kalkulation_id := coalesce(k.kalkulation_id, o.kalkulation_id);
      if coalesce(jsonb_array_length(k.arbeitsplan), 0) = 0 then k.arbeitsplan := o.arbeitsplan; end if;
      k.daten := coalesce(o.daten, '{}'::jsonb) || coalesce(k.daten, '{}'::jsonb);
      update erp_bewegungen set idx = coalesce(idx, o.idx), artikel_id = behalten where artikel_id = o.id;
      update erp_positionen set daten = coalesce(daten, '{}'::jsonb) || jsonb_build_object('idx', o.idx), artikel_id = behalten where artikel_id = o.id;
      delete from erp_artikel where id = o.id;
    end loop;
    -- der eigene frühere Index, falls er sich durch das Zusammenlegen geändert hat
    update erp_artikel set idx = k.idx, bezeichnung = k.bezeichnung, zeichnung = k.zeichnung,
      kunde_id = k.kunde_id, preis = k.preis, kalkulation_id = k.kalkulation_id,
      arbeitsplan = k.arbeitsplan,
      daten = case when jsonb_array_length(verlauf) > 0 then k.daten || jsonb_build_object('indexe', verlauf) else k.daten end
     where id = behalten;
  end loop;
end $$;

create unique index if not exists erp_artikel_hofer_nr on erp_artikel (nr) where art = 'hofer';

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_name = 'erp_bewegungen' and column_name = 'idx')
             and not exists (select 1 from erp_artikel where art = 'hofer' group by nr having count(*) > 1)
             and exists (select 1 from pg_indexes where indexname = 'erp_artikel_hofer_nr')
            then 'ok' else 'FEHLT' end as probe;
