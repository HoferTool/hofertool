-- =================================================================
--  Materialrechner: Ausschuss in Prozent je HOCO Nr. merken (seit 1.137.0)
--  Im Materialrechner steht ein Feld „Ausschuss %“, Standard 10 %.
--  Ändert jemand den Wert bei einer HOCO Nr., merkt sich die App ihn
--  beim Teil, genau wie die Form (Wunsch Patrick 22. Oktober 2026).
--  Leer heisst: Standard 10 %. Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.hoco_parts add column if not exists rechner_ausschuss_pct numeric;
comment on column public.hoco_parts.rechner_ausschuss_pct is 'Im Materialrechner gewählter Ausschuss in Prozent, leer = 10';

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'hoco_parts' and column_name = 'rechner_ausschuss_pct')
  then 'ok' else 'FEHLT' end as probe;
