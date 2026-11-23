-- Solaranlage: Tageswerte für das Fenster mit mehr Infos (seit 1.747.0)
-- Was diese Datei tut: legt die Lesefunktion solar_tage an. Sie fasst die
-- Messwerte aus solar_werte je Tag (Zeit Schweiz) zusammen: Ertrag,
-- Verbrauch, Netzbezug, Einspeisung, höchste Leistung und wann.
-- Sie liest nur, schreibt nichts, und gilt mit denselben Leserechten wie
-- die Tabelle (Externe sehen nichts). Mehrfach ausführbar.

create or replace function solar_tage(p_tage int default 90)
returns table (
  datum date, ertrag_kwh numeric, verbrauch_kwh numeric, bezug_kwh numeric,
  einspeisung_kwh numeric, spitze_w numeric, spitze_zeit timestamptz,
  verbrauch_spitze_w numeric, messungen int)
language sql stable security invoker set search_path = public as $$
  with w as (
    select gemessen, (gemessen at time zone 'Europe/Zurich')::date as tag,
           coalesce(produktion_w, 0) p, coalesce(verbrauch_w, 0) v,
           coalesce(netz_w, 0) n, ertrag_tag_kwh e,
           -- Abstand zur vorigen Messung in Stunden, höchstens 15 Minuten,
           -- damit eine Lücke nicht als Dauerleistung zählt
           least(extract(epoch from gemessen - lag(gemessen) over (order by gemessen)) / 3600.0, 0.25) h
    from solar_werte
    where gemessen >= now() - make_interval(days => least(greatest(p_tage, 1), 400))
  )
  select tag,
    -- Der Solar-Log zählt den Tagesertrag hoch und setzt ihn nachts auf 0;
    -- kurz nach Mitternacht steht noch der Wert von gestern, darum zählt
    -- der letzte Wert des Tages, nicht der grösste
    round(coalesce((array_agg(e order by gemessen desc) filter (where e is not null))[1],
                   sum(p * coalesce(h, 0)) / 1000.0), 2),
    round(sum(v * coalesce(h, 0)) / 1000.0, 2),
    round(sum(greatest(n, 0) * coalesce(h, 0)) / 1000.0, 2),
    round(sum(greatest(-n, 0) * coalesce(h, 0)) / 1000.0, 2),
    max(p),
    (array_agg(gemessen order by p desc))[1],
    max(v),
    count(*)::int
  from w group by tag order by tag;
$$;

grant execute on function solar_tage(int) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'solar_tage')
  then 'ok' else 'FEHLT' end as probe;
