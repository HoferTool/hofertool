-- HOFERTIME 3 (1.628.0): Gutschrift Spätschicht je Person.
-- Neue Spalte zeit_personen.spaet_gutschrift (Vorgabe aus). Wer das Häkchen
-- im Profil hat, bekommt 2:30 h gutgeschrieben, wenn das erste Kommen des
-- Tages ab 11:00 und das letzte Gehen nach 18:00 ist.
-- Gefahrlos mehrfach ausführbar.

alter table public.zeit_personen add column if not exists spaet_gutschrift boolean not null default false;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'zeit_personen' and column_name = 'spaet_gutschrift')
  then 'ok' else 'FEHLT' end as probe;
