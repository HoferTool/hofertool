-- =================================================================
--  Liefertermin je Bestellposition (seit 1.300.0, Wunsch Patrick
--  30. Oktober 2026)
--  Ein freies Feld wie „KW23“ oder „schnellstmöglich“. Steht etwas
--  darin, kommt es aufs Bestell-PDF beim Artikel. Leer = nichts.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
alter table public.order_items add column if not exists liefertermin text;

notify pgrst, 'reload schema';

-- Probe: zeigt ok oder FEHLT
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'order_items' and column_name = 'liefertermin')
  then 'ok' else 'FEHLT' end as probe;
