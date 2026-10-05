-- =================================================================
--  ALLES VOM 5. OKTOBER 2026 IN EINER DATEI
--
--  Im NEUEN Supabase-Projekt ausführen (lzhqwbxfwqamauntehof):
--  alles markieren, in den SQL Editor einfügen, einmal auf Run.
--
--  Darin stecken sechs Skripte, die bisher einzeln lagen. Keins davon
--  war in der Live-Datenbank schon gelaufen (am 5. Oktober 2026
--  nachgeschaut). Die Einzeldateien bleiben im Ordner sql/ liegen,
--  brauchen aber nicht mehr ausgeführt zu werden.
--
--    1  lieferant-logo.sql      eigenes Logo für Lieferanten
--    2  materialplatz.sql       eigenes Feld "Materialplatz"
--    3  notiz-material.sql      Material-Bestellung aus der Notiz
--                               (vor dem nächsten infoBoard-Import)
--    4  eigene-farben-weg.sql   alle Aufträge auf Palettenfarben
--    5  dokumente-pool.sql      Dokumenten-Pool meldet seinen Stand
--    6  solar.sql               Solaranlage, mit Solar-Schlüssel
--
--  Nicht dabei, mit Absicht:
--    offenes-passwort-weg.sql   darf nie laufen
--    profilbilder-admin.sql     nur, wenn beim Setzen eines fremden
--                               Profilbilds "row-level security" kommt
--
--  Am Ende steht eine kleine Tabelle mit zwei Zeilen:
--    "Alles eingerichtet"  -> ok  (sonst FEHLT mit dem fehlenden Teil)
--    "DEIN SOLAR-SCHLÜSSEL" -> der Schlüssel für solar-einstellungen.json.
--  Den Schlüssel nirgends sonst hinschicken, auch nicht in den Chat.
--
--  Läuft gefahrlos mehrfach: Ein zweiter Lauf ändert nichts mehr, und
--  der Solar-Schlüssel bleibt derselbe. Bricht etwas ab, bleibt die
--  Datenbank, wie sie vorher war (der SQL Editor führt alles in einem
--  Zug aus).
-- =================================================================


-- Während der Umstellung soll "Zuletzt geändert" an den Aufträgen
-- nicht bei rund 2'500 Aufträgen auf heute springen, nur weil hier
-- die Farbe oder das Material nachgetragen wird. Darum ist der
-- Auslöser dafür kurz aus und wird unten sofort wieder eingeschaltet.
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'jobs_geaendert'
               and tgrelid = 'public.jobs'::regclass) then
    alter table public.jobs disable trigger jobs_geaendert;
  end if;
end $$;


-- =================================================================
--  TEIL 1: LOGO FÜR LIEFERANTEN
--  (aus sql/lieferant-logo.sql)
--  Eigenes Logo je Lieferant (leer = automatisch, "keins" = nur
--  Buchstaben, sonst das Bild).
-- =================================================================
alter table public.suppliers add column if not exists logo_url text;


-- =================================================================
--  TEIL 2: MATERIALPLATZ ALS EIGENES FELD
--  (aus sql/materialplatz.sql)
--  Neue Spalte jobs.material_platz; Zeilen "Material: …" wandern
--  aus der Notiz dorthin; die Planwand-Sicht liefert die Spalte mit.
--  Kommt vor Teil 3, damit das Aufräumen der Notizen den neuen
--  Auslöser noch nicht anstösst.
-- =================================================================
-- ---------- 1. Die Spalte ----------
alter table public.jobs add column if not exists material_platz text;


-- ---------- 2. Bisherige Hinweise aus der Notiz übernehmen ----------
update public.jobs
   set material_platz = coalesce(nullif(material_platz, ''),
         trim(substring(plan_note from '(?:^|\n)[ \t]*[Mm][Aa][Tt][Ee][Rr][Ii][Aa][Ll]:[ \t]*([^\n]*)'))),
       plan_note = nullif(trim(regexp_replace(plan_note,
         '(^|\n)[ \t]*[Mm][Aa][Tt][Ee][Rr][Ii][Aa][Ll]:[^\n]*', '', 'g')), '')
 where plan_note ~* '(^|\n)[ \t]*material:';


-- ---------- 3. Die Planwand-Sicht bekommt die Spalte ----------
do $$
declare
  d text;
  invoker boolean;
begin
  if to_regclass('public.planwand') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'planwand'
               and column_name = 'material_platz') then return; end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;

  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, '
       || 'jm.material_platz from (' || d || ') v '
       || 'left join public.jobs jm on jm.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;


-- =================================================================
--  TEIL 3: MATERIAL-BESTELLUNG AUS DER NOTIZ
--  (aus sql/notiz-material.sql)
--  Liest "Mat BE: Metalix 2025007893 500kg 24.09.26" aus der Notiz
--  und trägt Menge und Liefertermin im Auftrag ein, auch beim
--  nächsten infoBoard-Import. Offene Aufträge werden einmal
--  nachgetragen, schon Eingetragenes bleibt.
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


-- =================================================================
--  TEIL 4: EIGENE FARBEN WEG
--  (aus sql/eigene-farben-weg.sql)
--  Jede eigene Farbe (#rrggbb) wird zur passenden Palettenfarbe:
--  Rot V2A, Blau Stahl, Rosa Chromstahl, Grau V4A, Weiss Alu,
--  Gelb Messing, Orange Neusilber, Senf Ecobrass, Violett Titan.
--  Danach nie mehr infoboard-farben.sql ausführen.
-- =================================================================
with feste(hex, farbe) as (values
  ('#ff0000', 'rot'),    ('#ff0080', 'rot'),
  ('#0000ff', 'blau'),   ('#1a1aff', 'blau'),   ('#00008b', 'blau'),
  ('#da70d6', 'rosa'),   ('#ff80c0', 'rosa'),   ('#ff80ff', 'rosa'),
  ('#c080ff', 'rosa'),   ('#ff00ff', 'rosa'),
  ('#515151', 'grau'),   ('#4b4b4b', 'grau'),   ('#726b70', 'grau'),
  ('#706b72', 'grau'),   ('#515153', 'grau'),   ('#535353', 'grau'),
  ('#808080', 'grau'),
  ('#ffffff', 'weiss'),
  ('#ffff00', 'gelb'),
  ('#ff8040', 'orange'), ('#ff732f', 'orange'), ('#008000', 'orange'),
  ('#ffa500', 'senf'),   ('#ff8000', 'senf'),   ('#e67300', 'senf')
),
palette(farbe, fr, fg, fb) as (values
  ('blau',      0,  56, 132), ('hellblau',  61, 127, 209), ('marine',    11,  35,  80),
  ('tuerkis',  13, 125, 140), ('cyan',      23, 162, 184), ('gruen',     31, 122,  77),
  ('hellgruen',111,191,  91), ('oliv',     107, 122,  47), ('gelb',     240, 180,  41),
  ('senf',    201, 146,  42), ('orange',   194, 101,  15), ('hellorange',240,139,  60),
  ('rot',     179,  38,  30), ('dunkelrot',122,  23,  18), ('rosa',     212,  99, 143),
  ('violett',  91,  58, 158), ('flieder',  155, 124, 201), ('braun',    122,  82,  48),
  ('beige',   216, 196, 154), ('grau',     122, 131, 141), ('anthrazit', 60,  68,  77),
  ('weiss',   255, 255, 255)
),
neu as (
  select j.id,
    case
      -- Titan ist bei euch Violett, egal welche Farbe infoBoard hatte
      when j.material_bez ilike '%titan%' then 'violett'
      else coalesce(
        (select f.farbe from feste f where f.hex = lower(j.color)),
        (select p.farbe from palette p
          order by 2 * (p.fr - ('x' || substr(j.color, 2, 2))::bit(8)::int) ^ 2
                 + 4 * (p.fg - ('x' || substr(j.color, 4, 2))::bit(8)::int) ^ 2
                 + 3 * (p.fb - ('x' || substr(j.color, 6, 2))::bit(8)::int) ^ 2
          limit 1))
    end as farbe
  from jobs j
  where j.color ~* '^#[0-9a-f]{6}$'
)
update jobs j
set color = n.farbe
from neu n
where n.id = j.id;

-- Was nicht nach #rrggbb aussieht, aber trotzdem keine Palettenfarbe ist
update jobs set color = 'blau'
where color like '#%';

-- Senf (Ecobrass) und Violett (Titan) kommen neu vor. Damit sie im
-- Auftragsfenster zur Wahl stehen, bekommen sie ein Material, falls
-- sie noch keins haben. Unter Einstellungen -> Farben und Material
-- lässt sich das jederzeit ändern.
insert into farb_material (farbe, material, buchstabe, sortierung)
values ('senf', 'Ecobrass', 'EB', 9), ('violett', 'Titan', 'T', 15)
on conflict (farbe) do nothing;


-- "Zuletzt geändert" wieder einschalten (siehe ganz oben)
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'jobs_geaendert'
               and tgrelid = 'public.jobs'::regclass) then
    alter table public.jobs enable trigger jobs_geaendert;
  end if;
end $$;


-- =================================================================
--  TEIL 5: DOKUMENTE-POOL: DIENSTKONTO MELDET SEINEN STAND
--  (aus sql/dokumente-pool.sql)
--  Rolle "dienst" erlauben; das Dienstkonto darf genau die zwei
--  Einträge dok_pfad_status und dok_pool_status schreiben.
-- =================================================================
-- Rolle "dienst" erlauben (dasselbe wie dienstkonto.sql)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role is null or role in ('admin', 'planwand', 'langdreher', 'kurzdreher',
                                  'mitarbeiter', 'produktion', 'extern', 'dienst')) not valid;

-- Ist die angemeldete Person das Dienstkonto?
create or replace function public.bin_dienst() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and is_active = true and role = 'dienst');
$$;

drop policy if exists "dienst meldet stand" on public.app_config;
create policy "dienst meldet stand" on public.app_config for all to authenticated
  using (schluessel in ('dok_pfad_status', 'dok_pool_status') and (select public.bin_dienst()))
  with check (schluessel in ('dok_pfad_status', 'dok_pool_status') and (select public.bin_dienst()));


-- =================================================================
--  TEIL 6: SOLARANLAGE IM NEUEN PROJEKT
--  (aus sql/solar.sql)
--  Tabelle solar_werte (ist schon da, dann passiert nichts), eigener
--  Solar-Schlüssel und die Funktion solar_melden für solarlog.ps1.
--  Einen NEUEN Schlüssel braucht es nur, wenn der alte in falsche
--  Hände geraten ist; die Zeile dafür steht in sql/solar.sql.
-- =================================================================
-- 1. Tabelle (nur falls sie fehlt)
create table if not exists public.solar_werte (
  id                  bigserial primary key,
  gemessen            timestamptz not null default now(),
  produktion_w        numeric,
  verbrauch_w         numeric,
  netz_w              numeric,
  batterie_w          numeric,
  ertrag_tag_kwh      numeric,
  bezug_tag_kwh       numeric,
  eingespeist_tag_kwh numeric,
  quelle              text
);
create index if not exists idx_solar_zeit on public.solar_werte (gemessen desc);
alter table public.solar_werte enable row level security;

drop policy if exists "lesen" on public.solar_werte;
create policy "lesen" on public.solar_werte
  for select to authenticated using (public.darf_lesen());

-- Die Sicht nur anlegen, wenn sie fehlt; eine vorhandene bleibt, wie sie ist
do $$ begin
  if to_regclass('public.solar_jetzt') is null then
    create view public.solar_jetzt with (security_invoker = true) as
      select * from public.solar_werte order by gemessen desc limit 1;
  end if;
end $$;

-- 2. Der Solar-Schlüssel. Die Tabelle ist für die App und für
--    Besucher ganz gesperrt, nur der SQL Editor sieht hinein.
create table if not exists public.solar_zugang (
  id         int primary key default 1 check (id = 1),
  schluessel text not null
             default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  erstellt   timestamptz not null default now()
);
alter table public.solar_zugang enable row level security;
revoke all on public.solar_zugang from anon, authenticated;
insert into public.solar_zugang (id) values (1) on conflict (id) do nothing;

-- 3. Werte abliefern. Das Skript ruft das über
--    /rest/v1/rpc/solar_melden mit dem öffentlichen Schlüssel der App
--    auf; was es darf, entscheidet allein der Solar-Schlüssel.
create or replace function public.solar_melden(
  schluessel  text,
  werte       jsonb,
  nur_pruefen boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  w jsonb := coalesce(werte, '{}'::jsonb);
begin
  if schluessel is null or not exists (
       select 1 from public.solar_zugang z where z.schluessel = solar_melden.schluessel) then
    raise exception 'Falscher Solar-Schlüssel' using errcode = '28000';
  end if;
  if nur_pruefen then
    return 'Schlüssel ok';
  end if;
  -- Höchstens ein Wert pro Minute: schützt vor einem Skript, das aus
  -- Versehen dauernd läuft, und vor doppelten Werten beim Wechsel.
  if exists (select 1 from public.solar_werte where gemessen > now() - interval '50 seconds') then
    return 'schon gemeldet';
  end if;
  insert into public.solar_werte (produktion_w, verbrauch_w, netz_w, batterie_w,
                                  ertrag_tag_kwh, bezug_tag_kwh, eingespeist_tag_kwh, quelle)
  values (nullif(w->>'produktion_w', '')::numeric,
          nullif(w->>'verbrauch_w', '')::numeric,
          nullif(w->>'netz_w', '')::numeric,
          nullif(w->>'batterie_w', '')::numeric,
          nullif(w->>'ertrag_tag_kwh', '')::numeric,
          nullif(w->>'bezug_tag_kwh', '')::numeric,
          nullif(w->>'eingespeist_tag_kwh', '')::numeric,
          left(coalesce(w->>'quelle', 'Solar-Log'), 60));
  -- Aufräumen wie solar_aufraeumen(): Älter als 90 Tage braucht die
  -- App nicht (der Verlauf zeigt höchstens einen Monat).
  delete from public.solar_werte where gemessen < now() - interval '90 days';
  return 'ok';
end $$;

revoke all on function public.solar_melden(text, jsonb, boolean) from public;
grant execute on function public.solar_melden(text, jsonb, boolean) to anon, authenticated;

create or replace function public.solar_aufraeumen() returns void
language sql security definer set search_path = public as $$
  delete from public.solar_werte where gemessen < now() - interval '90 days';
$$;
revoke all on function public.solar_aufraeumen() from public, anon, authenticated;


notify pgrst, 'reload schema';


-- =================================================================
--  ERGEBNIS: zwei Zeilen
-- =================================================================
with probe(teil, gut) as (values
  ('1 Lieferanten-Logo',
     exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'suppliers' and column_name = 'logo_url')),
  ('2 Materialplatz-Spalte',
     exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'jobs' and column_name = 'material_platz')),
  ('2 Planwand liefert Materialplatz',
     exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'planwand' and column_name = 'material_platz')),
  ('2 keine Zeile "Material:" mehr in Notizen',
     not exists (select 1 from public.jobs where plan_note ~* '(^|\n)[ \t]*material:')),
  ('3 Notiz lesen',
     coalesce((select menge_text || ' / ' || termin
                 from notiz_material_lesen('Mat BE: Metalix 2025007893 500kg 24.09.26'))
              = '500 kg · Metalix 2025007893 / 24.09.26', false)),
  ('3 Auslöser an Aufträgen',
     exists (select 1 from pg_trigger where tgname = 'jobs_material_aus_notiz')),
  ('4 keine eigenen Farben mehr',
     not exists (select 1 from public.jobs where color like '#%')),
  ('4 Senf und Violett haben ein Material',
     (select count(*) from public.farb_material where farbe in ('senf', 'violett')) = 2),
  ('"Zuletzt geändert" wieder an',
     not exists (select 1 from pg_trigger where tgname = 'jobs_geaendert'
                   and tgrelid = 'public.jobs'::regclass and tgenabled = 'D')),
  ('5 Rolle dienst',
     exists (select 1 from pg_constraint where conname = 'profiles_role_check'
             and pg_get_constraintdef(oid) ilike '%dienst%')),
  ('5 Dienstkonto meldet Stand',
     exists (select 1 from pg_policies where tablename = 'app_config'
             and policyname = 'dienst meldet stand')),
  ('6 Solar-Funktion',
     to_regprocedure('public.solar_melden(text,jsonb,boolean)') is not null),
  ('6 Solar-Schlüssel',
     exists (select 1 from public.solar_zugang where id = 1))
)
select 'Alles eingerichtet' as punkt,
       coalesce('FEHLT: ' || string_agg(teil, ', ') filter (where not gut), 'ok') as ergebnis
  from probe
union all
select 'DEIN SOLAR-SCHLÜSSEL (in solar-einstellungen.json eintragen)',
       coalesce((select schluessel from public.solar_zugang where id = 1), 'FEHLT');
