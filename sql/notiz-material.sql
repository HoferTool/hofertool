-- =================================================================
--  MATERIAL-BESTELLUNG AUS DER NOTIZ (111.39.0)
--
--  Was das tut, in einfachen Worten:
--  Steht in der Notiz eines Auftrags eine Material-Bestellung, am
--  besten so:  Mat BE: Metalix 2025007893 500kg 24.09.26
--  dann trägt die Datenbank Menge und Liefertermin selbst im Auftrag
--  ein. Das gilt für alles, was in die Aufträge kommt, also auch für
--  den nächsten infoBoard-Import.
--
--   1  Eine Funktion, die die Notiz liest (gleiche Regeln wie die App
--      in src/daten/materialBestellung.js).
--   2  Ein Auslöser an der Tabelle jobs: bei neuen Aufträgen füllt er
--      leere Felder, bei geänderter Notiz übernimmt er eine neu
--      erkannte Bestellung (was jemand im selben Zug von Hand in Menge
--      oder Termin geschrieben hat, bleibt).
--   3  Einmal für alle offenen Aufträge: leere Felder aus der Notiz
--      füllen. Schon Eingetragenes wird nicht überschrieben.
--
--  Erkannt wird eine Zeile mit Bestellnummer (zehn Ziffern, beginnt
--  mit 20). Menge (500kg, 1'300 kg, 200 Stk., 10 Stg.) und Termin
--  (24.09.26, 24.09.2026, 17.09, KW41) dürfen in derselben oder der
--  nächsten Zeile stehen. Mehrere Bestellungen: die mit „Mat BE“ gilt,
--  sonst die neueste mit Menge.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok
--  oder FEHLT.
-- =================================================================


-- ---------- 1  Lesen ----------

create or replace function notiz_menge(zeile text)
returns text language sql immutable as $$
  select case when m is null then null
    else replace(m[1], ',', '.') || ' ' ||
      case lower(m[2]) when 'kg' then 'kg' when 'stg' then 'Stg.' when 'stangen' then 'Stg.'
                       else 'Stk.' end
  end
  from (select regexp_match(coalesce(zeile, ''),
    '(?<![\d.,''])(\d{1,3}(?:''\d{3})+|\d+(?:[.,]\d+)?)\s*(kg|stk|stück|stg|stangen)\M', 'i') as m) x
$$;

create or replace function notiz_termin(zeile text, jahr text)
returns text language plpgsql immutable as $$
declare
  ohne text := regexp_replace(coalesce(zeile, ''), '(?<!\d)20\d{8}(?!\d)', ' ', 'g');
  d text[];
  j text;
  k text[];
begin
  -- Alle Treffer prüfen: „1.4301“ ist ein Werkstoff, kein Datum
  for d in select regexp_matches(ohne,
      '(?<![\d.])(\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?(?![\d.,]|\s*(chf|fr|kg|mm))', 'gi')
  loop
    if d[1]::int between 1 and 31 and d[2]::int between 1 and 12 then
      j := coalesce(d[3], '');
      if length(j) = 4 then j := right(j, 2); end if;
      -- Ohne Jahr („17.09“) gilt das Jahr der Bestellung
      if j = '' and jahr is not null then j := right(jahr, 2); end if;
      return lpad(d[1], 2, '0') || '.' || lpad(d[2], 2, '0') || case when j <> '' then '.' || j else '' end;
    end if;
  end loop;
  k := regexp_match(ohne, '\mKW\s*(\d{1,2})\M', 'i');
  if k is not null and k[1]::int between 1 and 53 then
    return 'KW' || lpad(k[1]::int::text, 2, '0');
  end if;
  return null;
end $$;

create or replace function notiz_lieferant(zeile text)
returns text language sql immutable as $$
  select w from (
    select regexp_replace(w, '\.$', '') as w, n
    from regexp_split_to_table(
           regexp_replace(regexp_replace(coalesce(zeile, ''), '\mmat\.?\s*be\M', ' ', 'gi'),
                          '[:+()|,]', ' ', 'g'),
           '\s+') with ordinality as t(w, n)
  ) x
  where w ~ '^[A-Za-zÄÖÜäöüé][A-Za-zÄÖÜäöüé-]+$'
    and lower(w) not in ('mat', 'be', 'ab', 'aus', 'rahmen', 'neuem', 'neuer', 'rohmaterial',
      'material', 'ca', 'von', 'am', 'für', 'davon', 'noch', 'bestellt', 'bei', 'im', 'an', 'lager',
      'kg', 'stk', 'stg', 'kw', 'h', 'nr', 'restmenge', 'ist')
  order by n
  limit 1
$$;

create or replace function notiz_material_lesen(notiz text)
returns table (nr text, lieferant text, menge text, termin text, menge_text text)
language plpgsql immutable as $$
declare
  zeilen text[] := regexp_split_to_array(coalesce(notiz, ''), E'\r?\n');
  i int;
  b text;
  naechste text;
  m text; t text; lf text;
  rang text;
  bester text := '';
begin
  for i in 1 .. coalesce(array_length(zeilen, 1), 0) loop
    b := substring(zeilen[i] from '(?<!\d)(20\d{8})(?!\d)');
    continue when b is null;
    -- Die nächste Zeile gehört dazu, wenn sie keine eigene Bestellung hat
    naechste := case when i < array_length(zeilen, 1)
                      and zeilen[i + 1] !~ '(?<!\d)20\d{8}(?!\d)' then zeilen[i + 1] else '' end;
    m := coalesce(notiz_menge(zeilen[i]), notiz_menge(naechste));
    t := coalesce(notiz_termin(zeilen[i], left(b, 4)), notiz_termin(naechste, left(b, 4)));
    continue when m is null and t is null;
    -- Rang: zuerst „Mat BE“, dann mit Menge, dann die höchste Nummer
    rang := (case when zeilen[i] ~* '\mmat\.?\s*be\M' then '1' else '0' end)
         || (case when m is not null then '1' else '0' end) || b;
    if rang > bester then
      bester := rang;
      nr := b; menge := m; termin := t;
      lieferant := notiz_lieferant(zeilen[i]);
    end if;
  end loop;
  if bester = '' then return; end if;
  menge_text := case when menge is null then null
    else menge || ' · ' || concat_ws(' ', lieferant, nr) end;
  return next;
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
    return new;
  end if;

  -- Geänderte Notiz: nur wenn darin eine andere Bestellung steht
  select * into vorher from notiz_material_lesen(old.plan_note);
  if vorher.menge_text is not distinct from r.menge_text
     and vorher.termin is not distinct from r.termin then
    return new;
  end if;
  -- Was im selben Zug von Hand gesetzt wurde, bleibt
  if r.menge_text is not null and new.material_menge is not distinct from old.material_menge then
    new.material_menge := r.menge_text;
    new.material_ok := true;
  end if;
  if r.termin is not null and new.material_liefertermin is not distinct from old.material_liefertermin then
    new.material_liefertermin := r.termin;
  end if;
  return new;
end $$;

drop trigger if exists jobs_material_aus_notiz on jobs;
create trigger jobs_material_aus_notiz
  before insert or update of plan_note on jobs
  for each row execute function jobs_material_aus_notiz();


-- ---------- 3  Offene Aufträge einmal nachtragen ----------

update jobs j set
  material_menge = coalesce(nullif(j.material_menge, ''), r.menge_text),
  material_liefertermin = coalesce(nullif(j.material_liefertermin, ''), r.termin),
  material_ok = j.material_ok or (coalesce(j.material_menge, '') = '' and r.menge_text is not null)
from (
  select x.id, l.*
  from jobs x, lateral notiz_material_lesen(x.plan_note) l
  where coalesce(x.plan_status, '') <> 'fertig'
) r
where r.id = j.id
  and ((coalesce(j.material_menge, '') = '' and r.menge_text is not null)
    or (coalesce(j.material_liefertermin, '') = '' and r.termin is not null));


notify pgrst, 'reload schema';


-- ---------- Probe ----------

select 'Notiz lesen' as punkt,
  case when (select menge_text || ' / ' || termin
               from notiz_material_lesen('Mat BE: Metalix 2025007893 500kg 24.09.26'))
            = '500 kg · Metalix 2025007893 / 24.09.26' then 'ok' else 'FEHLT' end as stand
union all
select 'Auslöser an jobs',
  case when exists (select 1 from pg_trigger where tgname = 'jobs_material_aus_notiz')
       then 'ok' else 'FEHLT' end
union all
select 'Offene Aufträge mit Material aus Notiz',
  count(*)::text
  from jobs j, lateral notiz_material_lesen(j.plan_note) l
  where coalesce(j.plan_status, '') <> 'fertig';
