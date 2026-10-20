-- =================================================================
--  NOTIZBÜCHER IM PAD MODE
--
--  Ein Notizbuch lässt sich einem oder mehreren Maschinenparks
--  zuweisen (beim Buch selbst: Stift → Parks). Im Pad Mode zeigt die
--  Kachel „Notizbücher“ an jeder Maschine nur die Bücher ihres Parks,
--  nur zum Lesen (Wunsch Patrick 15. Oktober 2026).
--
--  Was das Skript macht: neue Spalte parks (Liste der Park-Kennungen)
--  in der Tabelle notizbuecher. Leer heisst: in keinem Park.
--
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.notizbuecher
  add column if not exists parks uuid[] not null default '{}';

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte notizbuecher.parks' as punkt,
       case when exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'notizbuecher' and column_name = 'parks')
       then 'ok' else 'FEHLT' end as ergebnis;
