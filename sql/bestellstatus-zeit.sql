-- =================================================================
--  ZEITPUNKT DES STATUS BEI BESTELLUNGEN
--
--  Jede Bestellposition merkt sich, wann ihr Status zuletzt gewählt
--  wurde — auch beim Zurücksetzen und bei Teillieferungen. Die App
--  zeigt das in Offen, Bestellt und Historie an.
--
--  Bestehende Positionen bekommen ihren Zeitpunkt aus den bisherigen
--  Feldern: geliefert am, bestellt am oder angelegt am.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

alter table public.order_items add column if not exists status_am timestamptz;

update public.order_items
set status_am = coalesce(
  case status
    when 'geliefert'           then coalesce(delivered_at, completed_at)
    when 'bestellt'            then ordered_at
    when 'teilweise_geliefert' then ordered_at
  end,
  created_at)
where status_am is null;

notify pgrst, 'reload schema';

select 'order_items.status_am' as punkt,
       count(*) filter (where status_am is not null) || ' von ' || count(*) || ' mit Zeitpunkt' as ergebnis
from public.order_items;
