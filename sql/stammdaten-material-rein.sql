-- =================================================================
--  MATERIAL IN DEN STAMMDATEN AUFRÄUMEN (1.941.0, 27. November 2026)
--  Im Material der HOCO Nr. stand oft auch Lieferant, Menge,
--  Bestellnummer und Termin („CuZn38Pb2 rd 005 mm h9 Prometall
--  1100kg“), weil es so vom Auftrag übernommen wurde. Seit 1.941.0
--  übernimmt die App nur noch die Bezeichnung (materialOhneBestellung
--  in src/daten/materialBestellung.js). Dieses Skript räumt einmal
--  alle schon gespeicherten Einträge gleich auf.
--
--  Vorher kommt jeder alte Wert in die Tabelle
--  hoco_material_sicherung, damit man ihn zurückholen kann:
--    update hoco_parts h set material = s.material_alt
--      from hoco_material_sicherung s where s.hoco_nr = h.hoco_nr;
--  Mehrfach ausführen schadet nicht: Aufgeräumtes ändert sich nicht mehr,
--  und die Sicherung behält den ersten alten Wert.
-- =================================================================

create table if not exists public.hoco_material_sicherung (
  hoco_nr text primary key,
  material_alt text,
  gesichert_am timestamptz not null default now()
);
-- Nur für den Notfall, nicht für die App
alter table public.hoco_material_sicherung enable row level security;

create or replace function pg_temp.mat_rein(t text) returns text language plpgsql as $f$
declare s text := coalesce(t,''); m text[];
  lief text := '(steeltec|notz|prometall|prormetall|metalix|l\.\s?klein|klein|looser|schmobi|allega|valbruna|pfenninger|cellpack|apso parts)';
  tag text := '(0?[1-9]|[12]\d|3[01])'; monat text := '(0?[1-9]|1[0-2])';
begin
  if btrim(s) = '' then return ''; end if;
  s := regexp_replace(s, '((\ymaterial\s+)?\(?\s*(\d[\d.,'']*\s*kg\s*)?(noch\s+)?(ab|am|an|von|im)?\s*lager\y|\yab\s+rahmen\y|\ymat\.?\s*be\y|\ymaterial\s+muss\y|\ybestellt\y|\ywerden\s+angeliefert\y|\yauch\s+für\y|\ygesamt\s+\d|[\s-]*(\yfenster\s+)?\ynord\s+liegend).*$', ' ', 'i');
  loop
    m := regexp_match(s, '(^|[^\d.])(\d\.\d{4}\d{8,})($|[^\d.])');
    exit when m is null;
    s := replace(s, m[2], to_char(round(m[2]::numeric, 4), 'FM0.0000'));
  end loop;
  s := regexp_replace(s, '(^|\D)20\d{8}(?!\d)', '\1 ', 'g');
  s := regexp_replace(s, '\yTE\s*:?\s*' || tag || '\.{1,2}' || monat || '\.\d{2,4}(?!\d)', ' ', 'gi');
  s := regexp_replace(s, '(^|[^\d.])' || tag || '\.{1,2}' || monat || '\.(\d{4}|\d{2})(?![\d.])', '\1 ', 'g');
  s := regexp_replace(s, '\yTE\s*:?', ' ', 'g');
  s := regexp_replace(s, '\yKW\s*\d{1,2}\y', ' ', 'gi');
  s := regexp_replace(s, '\(?\s*\d+(?:[''.,]\d+)*\s*kg\.?\s*\)?', ' ', 'gi');
  s := regexp_replace(s, '\(?\s*\d+(?:[''.,]\d+)*\s*(stg|stk|stangen?|meter)(?![a-zäöü])\.?\s*\)?', ' ', 'gi');
  s := regexp_replace(s, '(^|[\s(,;/])' || lief || '(?=$|[\s),;:/.\d])', '\1 ', 'gi');
  s := regexp_replace(s, '\(\s*\)', ' ', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  s := regexp_replace(s, '[\s+|(,:;\-]+$', '');
  s := regexp_replace(s, '^[\s+|,:;]+', '');
  return btrim(s);
end $f$;

insert into public.hoco_material_sicherung (hoco_nr, material_alt)
select hoco_nr, material from public.hoco_parts
 where material is not null
   and pg_temp.mat_rein(material) is distinct from regexp_replace(btrim(material), '\s+', ' ', 'g')
on conflict (hoco_nr) do nothing;

update public.hoco_parts
   set material = nullif(pg_temp.mat_rein(material), '')
 where material is not null
   and pg_temp.mat_rein(material) is distinct from regexp_replace(btrim(material), '\s+', ' ', 'g');

notify pgrst, 'reload schema';

-- Probe: nichts mehr mit kg oder Bestellnummer im Material
select case when exists (select 1 from public.hoco_parts
  where material ~* '\d\s*kg|(^|\D)20\d{8}(\D|$)') then 'FEHLT' else 'ok' end as probe;
