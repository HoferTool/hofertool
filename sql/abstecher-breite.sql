-- =================================================================
--  ABSTECHERBREITE JE MASCHINENTYP (1.69.0)
--
--  Was das tut, in einfachen Worten:
--  Beim Maschinentyp kann man die Breite des Abstechers in mm
--  eintragen (Wunsch Patrick 15. Oktober 2026). Die App braucht sie
--  nur, um zu rechnen, wie viele Stangen oder kg Material ein Auftrag
--  braucht: je Teil Länge + Abstecher + 0,5 mm fürs Planieren.
--  Leer gelassen zählt der Abstecher als 0.
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

alter table public.machine_types add column if not exists abstecher_mm numeric;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Abstecher beim Typ' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'machine_types' and column_name = 'abstecher_mm') then 'ok' else 'FEHLT' end as ergebnis;
