-- Einrichtblätter in der App: Artikel automatisch nachziehen
-- (Wunsch Patrick, 30. Oktober 2026: „wenn ein Art. neu heisst, soll es
-- von der Datenbank übernehmen“)
--
-- Was die Datei tut, in einfachen Worten:
-- * Wird unter Bestellungen → Artikel ein Artikel geändert (Artikel-Nr.,
--   Bezeichnung, Beschreibung, Lieferant, Spezialwerkzeug) oder ein
--   Lieferant umbenannt, schreibt die Datenbank die neuen Angaben von
--   selbst in jeden Platz jedes Einrichtblatts, der diesen Artikel hat.
-- * Danach zieht sie einmal alle bestehenden Blätter nach.
-- * Auch Plätze, die die App beim Einlesen selbst zugeordnet hat (rot
--   umrandet, „ungeprueft“), aber nur, wenn dort genau die Artikel-Nr.
--   steht (vorher oder jetzt, ohne Leerzeichen, Striche, Gross/klein; am
--   30. Oktober 2026 waren es alle 1'065). Steht dort ein anderer Text
--   aus dem Excel, bleibt er für die Suche beim Prüfen. Rot bleiben sie,
--   bis jemand sie prüft.
-- * Ein Blatt wird nur angefasst, wenn sich wirklich etwas ändert; dann
--   kommt es auch neu in die PDF-Sicherung der Einrichtblätter.
-- Gefahrlos mehrfach ausführbar.

-- Ein Platz mit den Angaben seines Artikels (wie „nehmen“ in Blatt.jsx)
create or replace function public.eb_nr_kurz(x text)
returns text language sql immutable set search_path to 'public'
as $$ select regexp_replace(lower(coalesce(x, '')), '[^a-z0-9]', '', 'g') $$;

create or replace function public.eb_platz_mit_artikel(p jsonb, alt_nr text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  a record;
  q jsonb := p;
  nr text;
  bez text;
begin
  if jsonb_typeof(p) <> 'object' or coalesce(p->>'article_id', '') = '' then
    return p;
  end if;
  begin
    select ar.article_number, ar.name, ar.description, ar.supplier_id, ar.spezial, s.name as lieferant
      into a
      from articles ar left join suppliers s on s.id = ar.supplier_id
     where ar.id = (p->>'article_id')::uuid;
  exception when others then
    return p;
  end;
  if not found then return p; end if;
  if coalesce(p->>'ungeprueft', '') = 'true'
     and public.eb_nr_kurz(p->>'werkzeug') not in (public.eb_nr_kurz(a.article_number), public.eb_nr_kurz(alt_nr))
  then
    return p;
  end if;
  nr := coalesce(nullif(trim(a.article_number), ''), nullif(trim(a.name), ''));
  if nr is not null then q := q || jsonb_build_object('werkzeug', nr); end if;
  bez := nullif(trim(coalesce(a.description, '')), '');
  if bez is not null then q := q || jsonb_build_object('bezeichnung', bez); else q := q - 'bezeichnung'; end if;
  -- ohne Lieferant am Artikel bleibt der Hersteller, der im Blatt steht
  if nullif(trim(coalesce(a.lieferant, '')), '') is not null then q := q || jsonb_build_object('hersteller', a.lieferant); end if;
  if coalesce(a.spezial, false) then q := q || jsonb_build_object('spezial', true); else q := q - 'spezial'; end if;
  return q;
end $$;

-- Alle Plätze eines Blatts
create or replace function public.eb_plaetze_mit_artikel(pl jsonb, alt_nr text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when jsonb_typeof(pl) = 'object'
    then coalesce((select jsonb_object_agg(k, public.eb_platz_mit_artikel(v, alt_nr)) from jsonb_each(pl) as e(k, v)), pl)
    else pl end
$$;

-- Blätter nachziehen, die einen dieser Artikel haben (null = alle)
create or replace function public.eb_artikel_nachziehen(ids uuid[], alt_nr text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  with neu as (
    select b.id, public.eb_plaetze_mit_artikel(b.plaetze, alt_nr) as plaetze
      from einrichtblatt_app b
     where jsonb_typeof(b.plaetze) = 'object'
       and exists (select 1 from jsonb_each(b.plaetze) e(k, v)
                    where jsonb_typeof(v) = 'object' and coalesce(v->>'article_id', '') <> ''
                      and (ids is null or v->>'article_id' = any (ids::text[])))
  )
  update einrichtblatt_app b set plaetze = neu.plaetze
    from neu where neu.id = b.id and neu.plaetze is distinct from b.plaetze;
  get diagnostics n = row_count;
  return n;
end $$;

-- Kurzformen ohne vorherige Artikel-Nr. (ohne Vorgabewerte, damit es mit
-- einer früheren Fassung dieser Datei keine Doppeldeutigkeit gibt)
create or replace function public.eb_platz_mit_artikel(p jsonb)
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select public.eb_platz_mit_artikel(p, null::text) $$;
create or replace function public.eb_plaetze_mit_artikel(pl jsonb)
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select public.eb_plaetze_mit_artikel(pl, null::text) $$;
create or replace function public.eb_artikel_nachziehen(ids uuid[] default null)
returns integer language sql security definer set search_path to 'public'
as $$ select public.eb_artikel_nachziehen(ids, null::text) $$;

-- nur für die Auslöser, nicht von aussen aufrufbar
revoke all on function public.eb_platz_mit_artikel(jsonb) from public, anon, authenticated;
revoke all on function public.eb_plaetze_mit_artikel(jsonb) from public, anon, authenticated;
revoke all on function public.eb_artikel_nachziehen(uuid[]) from public, anon, authenticated;
revoke all on function public.eb_platz_mit_artikel(jsonb, text) from public, anon, authenticated;
revoke all on function public.eb_plaetze_mit_artikel(jsonb, text) from public, anon, authenticated;
revoke all on function public.eb_artikel_nachziehen(uuid[], text) from public, anon, authenticated;

-- Auslöser: Artikel geändert
create or replace function public.eb_artikel_geaendert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.article_number is distinct from old.article_number or new.name is distinct from old.name
     or new.description is distinct from old.description or new.supplier_id is distinct from old.supplier_id
     or new.spezial is distinct from old.spezial then
    perform public.eb_artikel_nachziehen(array[new.id], old.article_number);
  end if;
  return null;
end $$;

-- Auslöser: Lieferant umbenannt
create or replace function public.eb_lieferant_geaendert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ids uuid[];
begin
  if new.name is distinct from old.name then
    select array_agg(id) into ids from articles where supplier_id = new.id;
    if ids is not null then perform public.eb_artikel_nachziehen(ids, null::text); end if;
  end if;
  return null;
end $$;

-- create or replace trigger statt drop … create (geht über die Supabase-Verbindung ohne Freigabe)
create or replace trigger eb_artikel_nachziehen
  after update on public.articles
  for each row execute function public.eb_artikel_geaendert();

create or replace trigger eb_lieferant_nachziehen
  after update on public.suppliers
  for each row execute function public.eb_lieferant_geaendert();

-- Einmal alle bestehenden Blätter nachziehen
select public.eb_artikel_nachziehen(null) as nachgezogene_blaetter;

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn alles da ist und kein Blatt mehr abweicht
select case when
  exists (select 1 from pg_trigger where tgname = 'eb_artikel_nachziehen' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgname = 'eb_lieferant_nachziehen' and not tgisinternal)
  and not exists (select 1 from einrichtblatt_app b
                   where public.eb_plaetze_mit_artikel(b.plaetze) is distinct from b.plaetze)
  then 'ok' else 'FEHLT' end as probe;
