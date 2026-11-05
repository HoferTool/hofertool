-- =================================================================
--  SCHNELLER LADEN
--  Patrick 5. November 2026: „allgemein ist das Tool ziemlich langsam,
--  es lädt alles sehr lange“. Gemessen: Die Planwand-Abfrage brauchte
--  bei jedem Laden 0,2 bis 3 Sekunden, obwohl es nur rund 2'600
--  Aufträge sind. Kamen viele Geräte zugleich (etwa nach einer neuen
--  Fassung, wenn alle Tablets neu laden), stauten sich die Abfragen,
--  die Datenbank brach sie nach 8 Sekunden ab, und für ein paar Minuten
--  wartete jede andere Abfrage bis 2 Minuten (5. November 2026,
--  8:21 bis 8:28 Uhr).
--
--  Zwei Ursachen, beide behebt diese Datei:
--  1. Die Regeln (Policies) riefen darf_lesen(), darf_schreiben(),
--     bin_admin() … für JEDE Zeile neu auf, und jeder Aufruf fragt die
--     Tabelle profiles ab. In Klammern mit select rechnet die Datenbank
--     das nur einmal je Abfrage. Was die Regeln erlauben, bleibt genau
--     gleich: die Funktionen haben keine Werte je Zeile.
--  2. Die Ansicht planwand hängte die Tabelle jobs mit jeder neuen
--     Spalte noch einmal an sich selbst (fünfmal). Jetzt liest sie jobs
--     ein einziges Mal, mit genau denselben Spalten in derselben Reihe.
--
--  Nichts wird gelöscht. Mehrfach ausführbar. Probe am Ende: ok / FEHLT.
-- =================================================================

-- 1. Regeln: Funktionsaufrufe ohne Werte in (select …) setzen
do $$
declare
  r record;
  muster constant text := '(?<!SELECT )\m(darf_lesen|darf_schreiben|darf_planen|darf_kontrolle|bin_admin|bin_dienst|ist_extern)\(\)';
  neu_q text;
  neu_c text;
  befehl text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check
           from pg_policies where schemaname = 'public' loop
    neu_q := case when r.qual is null then null
                  else regexp_replace(r.qual, muster, '(select \1())', 'g') end;
    neu_c := case when r.with_check is null then null
                  else regexp_replace(r.with_check, muster, '(select \1())', 'g') end;
    if neu_q is not distinct from r.qual and neu_c is not distinct from r.with_check then continue; end if;
    befehl := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if neu_q is not null then befehl := befehl || ' using (' || neu_q || ')'; end if;
    if neu_c is not null then befehl := befehl || ' with check (' || neu_c || ')'; end if;
    execute befehl;
  end loop;
end $$;

-- 2. Ansicht planwand: jobs nur einmal lesen
do $$
declare invoker boolean;
begin
  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;
  create or replace view public.planwand as
  select j.id, j.job_number, j.fa_nr, j.machine_id,
         m.name as maschine, m.machine_number as maschine_nr, m.park_id,
         m.sort_order as maschine_reihenfolge, p.name as park,
         j.planned_from, j.planned_days, j.planned_to, j.plan_note,
         j.drawing_url, j.wbg_url, j.wz_historie_url, j.target_quantity,
         j.color, j.plan_status, j.problem, j.problem_at, j.problem_by,
         pr.full_name as problem_von, j.fa_erstellt, j.material_ok,
         j.material_dm, j.material_toleranz, j.material_bez, j.material_menge,
         j.material_liefertermin, j.started_at, j.ended_at,
         j.ended_at is null as laeuft,
         coalesce((select r.quantity from public.production_records r
                   where r.job_id = j.id order by r.record_date desc limit 1), 0) as stand,
         j.geaendert_von, j.geaendert_am, j.material_platz, j.symbole,
         j.abruf_info, j.geplant_von, j.created_at, j.material_m_trotzdem
  from public.jobs j
  join public.machines m on m.id = j.machine_id
  join public.machine_parks p on p.id = m.park_id
  left join public.profiles pr on pr.id = j.problem_by;
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe: keine Regel ruft die Funktionen mehr je Zeile auf, und die
-- Ansicht liest jobs nur noch einmal
select case
  when not exists (select 1 from pg_policies where schemaname = 'public'
         and (coalesce(qual, '') ~ '(?<!SELECT )\m(darf_lesen|darf_schreiben|bin_admin|ist_extern)\(\)'
           or coalesce(with_check, '') ~ '(?<!SELECT )\m(darf_lesen|darf_schreiben|bin_admin|ist_extern)\(\)'))
   and pg_get_viewdef('public.planwand'::regclass) !~ 'jm2'
  then 'ok' else 'FEHLT' end as schneller_laden;
