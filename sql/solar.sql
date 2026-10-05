-- =================================================================
--  SOLARANLAGE IM NEUEN PROJEKT
--
--  Im NEUEN Supabase-Projekt ausführen (lzhqwbxfwqamauntehof).
--
--  Was es tut:
--  1. Legt die Tabelle solar_werte an, falls sie fehlt (sie ist beim
--     Umzug schon mitgekommen, dann passiert hier nichts).
--  2. Erzeugt einen eigenen Solar-Schlüssel. Mit ihm darf das Skript
--     solarlog.ps1 neue Messwerte abliefern, sonst nichts: nichts
--     lesen, nichts ändern, nichts löschen. Den geheimen Haupt-
--     schlüssel des Projekts braucht der Rechner damit nicht mehr.
--  3. Die Funktion solar_melden nimmt die Werte an, prüft den
--     Schlüssel, nimmt höchstens einen Wert pro Minute an und räumt
--     Werte älter als 90 Tage weg.
--
--  Ganz unten steht dein Solar-Schlüssel. Den trägst du in
--  solar-einstellungen.json neben dem Skript ein. Er gehört nirgends
--  sonst hin, auch nicht ins GitHub.
--
--  Läuft gefahrlos mehrfach, der Schlüssel bleibt dabei derselbe.
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

-- Einen NEUEN Schlüssel braucht es nur, wenn der alte in falsche Hände
-- geraten ist. Dann diese Zeile ohne die zwei Striche vorne ausführen
-- und den neuen Wert in solar-einstellungen.json eintragen:
-- update public.solar_zugang set schluessel = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), erstellt = now();

-- Probe
select 'Tabelle solar_werte' as punkt,
       case when to_regclass('public.solar_werte') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Funktion solar_melden',
       case when to_regprocedure('public.solar_melden(text,jsonb,boolean)') is not null then 'ok' else 'FEHLT' end
union all
select 'Letzter Solarwert',
       coalesce(to_char((select max(gemessen) from public.solar_werte) at time zone 'Europe/Zurich',
                        'DD.MM.YYYY HH24:MI'), 'noch keiner')
union all
select 'DEIN SOLAR-SCHLÜSSEL (in solar-einstellungen.json eintragen)',
       coalesce((select schluessel from public.solar_zugang where id = 1), 'FEHLT');
