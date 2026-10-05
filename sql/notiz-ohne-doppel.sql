-- =================================================================
--  BESTELLUNG NICHT DOPPELT IN DER NOTIZ (111.57.0)
--
--  Was das tut, in einfachen Worten:
--  Seit 111.39.0 holt die Datenbank Menge und Liefertermin aus einer
--  Material-Bestellung in der Notiz (sql/notiz-material.sql). Danach
--  stand alles zweimal da: im Feld und in der Notiz. Jetzt fällt aus
--  der Notiz weg, was schon im Feld steht (Wunsch 5. Oktober 2026):
--
--   1  Eine Funktion, die aus der Notiz Menge, Bestellnummer,
--      Lieferant und Termin herausnimmt, aber nur, wenn genau das in
--      Menge und Liefertermin des Auftrags steht. Was sonst in der
--      Zeile steht (Werkstoff, „davon 1200kg“ …), bleibt. Gleiche
--      Regeln wie die App in src/daten/materialBestellung.js.
--   2  Der Auslöser an der Tabelle jobs macht das ab jetzt bei jeder
--      neuen oder geänderten Notiz, also auch beim infoBoard-Import.
--   3  Einmal für alle Aufträge der Planwand, auch die fertigen.
--
--  Braucht sql/notiz-material.sql (läuft schon). Gefahrlos mehrfach
--  ausführbar. Am Ende steht eine Probe mit ok oder FEHLT.
-- =================================================================


-- ---------- 1  Herausnehmen ----------

-- Das Datum, so wie es in der Zeile steht („24.09.26“, „KW41“)
create or replace function notiz_termin_roh(zeile text)
returns text language plpgsql immutable as $$
declare
  ohne text := regexp_replace(coalesce(zeile, ''), '(?<!\d)20\d{8}(?!\d)', ' ', 'g');
  d text[];
  k text;
begin
  for d in select regexp_matches(ohne,
      '((?<![\d.])(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?(?![\d.,]|\s*(chf|fr|kg|mm)))', 'gi')
  loop
    if d[2]::int between 1 and 31 and d[3]::int between 1 and 12 then
      return d[1];
    end if;
  end loop;
  k := substring(ohne from '(?i)(\mKW\s*\d{1,2}\M)');
  if k is not null and substring(k from '\d+')::int between 1 and 53 then return k; end if;
  return null;
end $$;

-- Erstes Vorkommen eines Textes durch ein Leerzeichen ersetzen
create or replace function notiz_erstes_weg(zeile text, teil text)
returns text language sql immutable as $$
  select case when coalesce(teil, '') = '' or position(teil in zeile) = 0 then zeile
    else overlay(zeile placing ' ' from position(teil in zeile) for length(teil)) end
$$;

-- Was übrig bleibt; null, wenn nur noch Füllwörter dastehen
create or replace function notiz_zeile_aufraeumen(zeile text)
returns text language plpgsql immutable as $$
declare
  rest text := regexp_replace(regexp_replace(coalesce(zeile, ''), '\s+', ' ', 'g'),
                              '^[\s|:,;\-]+|[\s|:,;\-]+$', '', 'g');
begin
  if exists (select 1 from regexp_split_to_table(lower(rest), '[^a-zäöüé0-9'']+') w
             where w <> '' and w not in ('mat', 'be', 'te', 'ca', 'ab', 'am', 'von', 'bis',
               'für', 'nr', 'bestellt', 'liefertermin', 'termin', 'menge', 'kw')) then
    return rest;
  end if;
  return null;
end $$;

create or replace function notiz_material_entfernen(notiz text, menge text, termin text)
returns text language plpgsql immutable as $$
declare
  r record;
  zeilen text[] := regexp_split_to_array(coalesce(notiz, ''), E'\r?\n');
  anzahl int := coalesce(array_length(regexp_split_to_array(coalesce(notiz, ''), E'\r?\n'), 1), 0);
  neu text[];
  raus text[] := '{}';
  i int; n int := 0; z int; j int;
  b text; naechste text; m text; t text;
  rang text; bester text := '';
  menge_da boolean; termin_da boolean;
  roh text; rest text;
begin
  select * into r from notiz_material_lesen(notiz);
  if r.nr is null then return notiz; end if;
  menge_da := r.menge_text is not null
    and (btrim(coalesce(menge, '')) = r.menge_text or position(r.nr in coalesce(menge, '')) > 0);
  termin_da := r.termin is not null and btrim(coalesce(termin, '')) = r.termin;
  if not menge_da and not termin_da then return notiz; end if;

  -- Dieselbe Zeile finden, die notiz_material_lesen gewählt hat
  i := 0;
  for j in 1 .. anzahl loop
    b := substring(zeilen[j] from '(?<!\d)(20\d{8})(?!\d)');
    continue when b is null;
    naechste := case when j < anzahl and zeilen[j + 1] !~ '(?<!\d)20\d{8}(?!\d)'
                     then zeilen[j + 1] else '' end;
    m := coalesce(notiz_menge(zeilen[j]), notiz_menge(naechste));
    t := coalesce(notiz_termin(zeilen[j], left(b, 4)), notiz_termin(naechste, left(b, 4)));
    continue when m is null and t is null;
    rang := (case when zeilen[j] ~* '\mmat\.?\s*be\M' then '1' else '0' end)
         || (case when m is not null then '1' else '0' end) || b;
    if rang > bester then bester := rang; i := j; end if;
  end loop;
  if i = 0 then return notiz; end if;
  if i < anzahl and zeilen[i + 1] !~ '(?<!\d)20\d{8}(?!\d)' then n := i + 1; end if;

  neu := zeilen;
  if menge_da then
    z := case when notiz_menge(neu[i]) is not null then i else n end;
    if z > 0 then
      neu[z] := regexp_replace(neu[z],
        '(?<![\d.,''])(\d{1,3}(?:''\d{3})+|\d+(?:[.,]\d+)?)\s*(kg|stk|stück|stg|stangen)\M\.?', ' ', 'i');
    end if;
    neu[i] := notiz_erstes_weg(neu[i], r.nr);
    neu[i] := regexp_replace(neu[i], '\mmat\.?\s*be\M', ' ', 'i');
    neu[i] := notiz_erstes_weg(neu[i], r.lieferant);
  end if;
  if termin_da then
    z := case when notiz_termin_roh(zeilen[i]) is not null then i else n end;
    if z > 0 then
      roh := notiz_termin_roh(neu[z]);
      neu[z] := notiz_erstes_weg(neu[z], roh);
    end if;
  end if;

  for j in 1 .. anzahl loop
    if (j = i or j = n) and neu[j] is distinct from zeilen[j] then
      rest := notiz_zeile_aufraeumen(neu[j]);
      if rest is not null then raus := raus || rest; end if;
    else
      raus := raus || zeilen[j];
    end if;
  end loop;
  return regexp_replace(array_to_string(raus, E'\n'), '\s+$', '');
end $$;


-- ---------- 2  Auslöser an den Aufträgen ----------

create or replace function jobs_material_aus_notiz()
returns trigger language plpgsql as $$
declare
  r record;
  vorher record;
begin
  select * into r from notiz_material_lesen(new.plan_note);
  if r.nr is null then return new; end if;

  if tg_op = 'INSERT' then
    -- Neuer Auftrag (auch aus infoBoard): nur leere Felder füllen
    if coalesce(new.material_menge, '') = '' and r.menge_text is not null then
      new.material_menge := r.menge_text;
      new.material_ok := true;
    end if;
    if coalesce(new.material_liefertermin, '') = '' and r.termin is not null then
      new.material_liefertermin := r.termin;
    end if;
  else
    -- Geänderte Notiz: nur übernehmen, wenn darin eine andere Bestellung steht
    select * into vorher from notiz_material_lesen(old.plan_note);
    if vorher.menge_text is distinct from r.menge_text
       or vorher.termin is distinct from r.termin then
      -- Was im selben Zug von Hand gesetzt wurde, bleibt
      if r.menge_text is not null and new.material_menge is not distinct from old.material_menge then
        new.material_menge := r.menge_text;
        new.material_ok := true;
      end if;
      if r.termin is not null and new.material_liefertermin is not distinct from old.material_liefertermin then
        new.material_liefertermin := r.termin;
      end if;
    end if;
  end if;

  -- Was jetzt in Menge und Liefertermin steht, nicht doppelt in der Notiz
  new.plan_note := notiz_material_entfernen(new.plan_note, new.material_menge, new.material_liefertermin);
  return new;
end $$;

drop trigger if exists jobs_material_aus_notiz on jobs;
create trigger jobs_material_aus_notiz
  before insert or update of plan_note on jobs
  for each row execute function jobs_material_aus_notiz();


-- ---------- 3  Alle Aufträge einmal bereinigen ----------

update jobs j set plan_note = x.neu
from (
  select id, notiz_material_entfernen(plan_note, material_menge, material_liefertermin) as neu
  from jobs
  where plan_note ~ '(?<!\d)20\d{8}(?!\d)'
) x
where x.id = j.id and x.neu is distinct from j.plan_note;


notify pgrst, 'reload schema';


-- ---------- Probe ----------

select 'Notiz ohne Doppeltes' as punkt,
  case when notiz_material_entfernen('Steeltec 2026008632 180kg 1.7139 15.09.26',
              '180 kg · Steeltec 2026008632', '15.09.26') = '1.7139'
        and notiz_material_entfernen('Mat BE: Metalix 2025007893 500kg 24.09.26', '', '') =
              'Mat BE: Metalix 2025007893 500kg 24.09.26'
       then 'ok' else 'FEHLT' end as stand
union all
select 'Auslöser an jobs',
  case when exists (select 1 from pg_trigger where tgname = 'jobs_material_aus_notiz')
        and pg_get_functiondef('jobs_material_aus_notiz'::regproc) like '%notiz_material_entfernen%'
       then 'ok' else 'FEHLT' end
union all
select 'Aufträge mit doppelter Bestellung in der Notiz (soll 0 sein)',
  count(*)::text
  from jobs
  where plan_note ~ '(?<!\d)20\d{8}(?!\d)'
    and notiz_material_entfernen(plan_note, material_menge, material_liefertermin)
        is distinct from plan_note;
