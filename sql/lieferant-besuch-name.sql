-- Besuche bei Lieferanten merken sich den Namen der Kontaktperson selbst.
-- Wird die Kontaktperson später gelöscht, steht ihr Name trotzdem weiter beim Besuch.
-- Gefahrlos mehrfach ausführbar.

alter table public.lieferant_besuche add column if not exists kontakt_name text;

-- Bestehende Besuche: Namen aus der Kontaktperson nachtragen
update public.lieferant_besuche b
   set kontakt_name = k.name
  from public.lieferant_kontakte k
 where b.kontakt_id = k.id and b.kontakt_name is null;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'lieferant_besuche' and column_name = 'kontakt_name')
  then 'ok' else 'FEHLT' end as probe;
