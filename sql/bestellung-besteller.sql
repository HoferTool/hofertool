-- Besteller als Text an der Bestellposition (seit 1.509.0).
-- Bestellt das Gerätekonto Pad Mode (etwa aus dem Einrichtblatt), steht
-- dort die Maschine des iPads statt „Pad Mode“ (Wunsch Patrick
-- 13. November 2026). Leer = wie bisher der Name des Kontos.
-- Gefahrlos mehrfach ausführbar.
alter table public.order_items add column if not exists besteller text;
notify pgrst, 'reload schema';
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'order_items' and column_name = 'besteller')
  then 'ok' else 'FEHLT' end as probe;
