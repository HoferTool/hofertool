-- Test ERP: Lagerbewegungen aus dem Gewatec (Verlauf, nur zum Ansehen).
-- Was die Datei tut:
--  * legt die Tabelle erp_bewegungen_gewatec an. Darin stehen alle früheren
--    Lagerbewegungen aus dem Gewatec (Zugang, Abgang, Lieferung, Fertigmeldung …).
--  * Der Bestand rechnet NICHT damit: der heutige Bestand steht weiter als
--    Startbuchung "GEWATEC" in erp_bewegungen. Die App zeigt den Verlauf nur
--    in den Listen der Lagerbewegungen an und lädt ihn erst beim Öffnen.
--  * Lesen nur, wer das Test ERP sieht (erp_darf). Schreiben nur der Server.
-- Gefahrlos mehrfach ausführbar.

create table if not exists public.erp_bewegungen_gewatec (
  gw_id integer primary key,
  artikel_id uuid references public.erp_artikel(id) on delete set null,
  gw_artikel integer,
  artikelcode text,
  am timestamptz,
  menge numeric,
  einheit text,
  lagerort text,
  endlager text,
  idx text,
  charge text,
  fa text,
  ls_intern text,
  kunde text,
  lieferant text,
  ls_lieferant text,
  bemerkung text,
  wer text,
  ohne_buchung boolean default false
);

create index if not exists erp_bew_gw_artikel on public.erp_bewegungen_gewatec (artikel_id, am desc);
create index if not exists erp_bew_gw_am on public.erp_bewegungen_gewatec (am desc);

alter table public.erp_bewegungen_gewatec enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'erp_bewegungen_gewatec' and policyname = 'erp bew gw lesen') then
    create policy "erp bew gw lesen" on public.erp_bewegungen_gewatec
      for select to authenticated using ((select erp_darf()));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when to_regclass('public.erp_bewegungen_gewatec') is not null then 'ok' else 'FEHLT' end as probe;
