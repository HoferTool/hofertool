-- =================================================================
--  TEILLIEFERUNG MIT MENGE
--
--  Eine Spalte an den Bestellpositionen: wie viel von der bestellten
--  Menge schon geliefert ist. Die App fragt danach, sobald eine
--  Position auf "Teilweise geliefert" gesetzt wird, und zeigt in der
--  Liste "20 da · 30 offen".
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.order_items add column if not exists geliefert_menge numeric;

notify pgrst, 'reload schema';

select 'order_items.geliefert_menge' as punkt,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'order_items'
                           and column_name = 'geliefert_menge')
            then 'ok' else 'FEHLT' end as ergebnis;
