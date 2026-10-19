-- =================================================================
--  Materialrechner: Form je HOCO Nr. merken (seit 1.101.0)
--  Rechnet jemand im Materialrechner eine HOCO Nr. als Rohr (mit
--  Innendurchmesser), Sechskant oder Vierkant, merkt sich die App das
--  beim Teil. Beim nächsten Mal steht die Form schon da, und die
--  Mat. info. rechnet ebenfalls damit (Wunsch Patrick 19. Oktober 2026).
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.hoco_parts add column if not exists rechner_form text;
alter table public.hoco_parts add column if not exists rechner_innen_mm numeric;
comment on column public.hoco_parts.rechner_form is 'Im Materialrechner gewählte Form: rd, 4kt, 6kt oder rohr';
comment on column public.hoco_parts.rechner_innen_mm is 'Innendurchmesser in mm, wenn rechner_form = rohr';

notify pgrst, 'reload schema';

-- Probe
select case when (select count(*) from information_schema.columns where table_schema = 'public'
  and table_name = 'hoco_parts' and column_name in ('rechner_form', 'rechner_innen_mm')) = 2
  then 'ok' else 'FEHLT' end as probe;
