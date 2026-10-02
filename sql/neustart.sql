-- =================================================================
--  NEUSTART VON NULL — vor dem Import aus infoBoard
--
--  Weg sind: alle Aufträge auf der Planwand, die erfassten
--  Stückzahlen, die Werkzeugwechsel, die Zähler je Auftrag und die
--  Stammdaten der HOCO Nummern ohne hinterlegte Zeichnung (also
--  die, die nur aus Testaufträgen entstanden sind).
--
--  Bleibt: HOCO Nummern mit hinterlegter Zeichnung, Maschinen, Typen, Werkzeugplätze, Bestellungen,
--  Artikel, Lieferanten, Dokumente, Kameras, Nutzer.
--
--  ZWEI TEILE. Erst Teil 1 ansehen. Dann Teil 2 ausführen.
--  Gelöscht ist gelöscht — vorher die Sicherung laufen lassen.
-- =================================================================


-- ---------- TEIL 1: Was passiert ----------

select
  (select count(*) from public.jobs)                          as auftraege_weg,
  (select count(*) from public.production_records)            as stueckzahlen_weg,
  (select count(*) from public.tool_changes)                  as werkzeugwechsel_weg,
  (select count(*) from public.hoco_parts
     where coalesce(zeichnung_url, '') = '')                    as hoco_ohne_zeichnung_weg,
  (select count(*) from public.hoco_parts)                    as hoco_gesamt,
  (select count(*) from public.machines)                      as maschinen_bleiben;


-- ---------- TEIL 2: Löschen ----------

begin;

-- Stückzahlen und Werkzeugwechsel hängen an Aufträgen
delete from public.production_records;
delete from public.tool_changes;

-- Was sonst noch je Auftrag gespeichert wird, falls die Tabellen da sind
do $$
begin
  if to_regclass('public.setup_snapshots') is not null then
    execute 'delete from public.setup_snapshots';
  end if;
  if to_regclass('public.setup_sheets') is not null then
    execute 'delete from public.setup_sheet_slots';
    execute 'delete from public.setup_sheets';
  end if;
end $$;

-- Die Aufträge selbst
delete from public.jobs;

-- HOCO Nummern ohne hinterlegte Zeichnung — die sind aus den
-- Testaufträgen entstanden. Die mit Zeichnung bleiben stehen.
delete from public.hoco_parts h
where coalesce(h.zeichnung_url, '') = '';

-- Programm, Abendstück und Pad-Info zu Nummern, die es nicht mehr gibt
delete from public.hoco_type_data d
where not exists (select 1 from public.hoco_parts h where h.hoco_nr = d.hoco_nr);

commit;


-- ---------- Nachher: die Probe ----------

select
  (select count(*) from public.jobs)               as auftraege,
  (select count(*) from public.production_records) as stueckzahlen,
  (select count(*) from public.tool_changes)       as werkzeugwechsel,
  (select count(*) from public.hoco_parts)         as hoco_bleiben,
  (select count(*) from public.machines)           as maschinen;
