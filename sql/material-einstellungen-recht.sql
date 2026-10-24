-- =================================================================
--  Farben und Material auch für „Materialplatz bearbeiten“
--  (Wunsch Patrick 24. Oktober 2026, seit 1.172.0)
--
--  Wer unter Einstellungen → Nutzer das Häkchen „Materialplatz
--  bearbeiten“ hat, sieht jetzt auch den Reiter „Farben und Material“
--  und darf dort ändern: Material und Kürzel je Farbe (farb_material),
--  Faktor (material_dichte), Werkstofferkennung (werkstoff_zuordnung)
--  und die von Hand eingetragenen Werkstoffnummern (werkstoff_nummern).
--  Alles andere bleibt bei den Admins.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'farb_material' and policyname = 'materialplatz pflegt') then
    create policy "materialplatz pflegt" on public.farb_material for all to authenticated
      using ((select public.darf_materialplatz())) with check ((select public.darf_materialplatz()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'materialplatz material') then
    create policy "materialplatz material" on public.app_config for all to authenticated
      using (schluessel in ('material_dichte', 'werkstoff_zuordnung', 'werkstoff_nummern') and (select public.darf_materialplatz()))
      with check (schluessel in ('material_dichte', 'werkstoff_zuordnung', 'werkstoff_nummern') and (select public.darf_materialplatz()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- Probe
select case when (select count(*) from pg_policies
  where (tablename, policyname) in (('farb_material', 'materialplatz pflegt'), ('app_config', 'materialplatz material'))) = 2
  then 'ok' else 'FEHLT' end as probe;
