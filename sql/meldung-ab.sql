-- =================================================================
--  MELDUNG ERST AB EINEM ZEITPUNKT (1.314.0)
--
--  Was das tut, in einfachen Worten:
--  Eine Meldung beim Anmelden kann jetzt einen Zeitpunkt „ab“ haben,
--  etwa Montag 03:00. Vorher sieht sie niemand ausser Admins (in der
--  Liste unter Einstellungen); danach erscheint sie wie jede andere.
--  Leer = sofort, wie bisher.
--
--  Gefahrlos mehrfach ausführbar, ohne drop. Am Ende Probe ok / FEHLT.
-- =================================================================

alter table public.anmelde_meldungen add column if not exists ab timestamptz;

-- Zusätzliche Sperre beim Lesen: vor „ab“ nur Admins. Restriktiv, damit
-- die bestehende Leseregel nicht geändert (gelöscht) werden muss.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'anmelde_meldungen'
                 and policyname = 'anmelde_meldungen erst ab') then
    create policy "anmelde_meldungen erst ab" on public.anmelde_meldungen
      as restrictive for select to authenticated
      using (ab is null or ab <= now() or public.bin_admin());
  end if;
end $$;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns
  where table_name = 'anmelde_meldungen' and column_name = 'ab')
  and exists (select 1 from pg_policies where policyname = 'anmelde_meldungen erst ab')
  then 'ok' else 'FEHLT' end as probe;
