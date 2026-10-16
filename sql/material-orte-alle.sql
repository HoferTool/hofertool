-- =================================================================
--  MATERIAL: ORTE DÜRFEN ALLE ÄNDERN
--  Die Liste der Orte auf der Seite Material (Knöpfe beim Erfassen)
--  dürfen alle angemeldeten Leute ändern und ergänzen, nicht nur
--  Admins (Wunsch Patrick 16. Oktober 2026). Externe und das
--  Dienstkonto nicht. Betrifft nur den Eintrag material_orte.
--  Mehrfach ausführbar.
-- =================================================================

drop policy if exists "material orte alle" on public.app_config;
create policy "material orte alle" on public.app_config for all to authenticated
  using (schluessel = 'material_orte' and darf_lesen() and not ist_extern() and not bin_dienst())
  with check (schluessel = 'material_orte' and darf_lesen() and not ist_extern() and not bin_dienst());

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_policies where tablename = 'app_config'
  and policyname = 'material orte alle') then 'ok' else 'FEHLT' end as material_orte_alle;
