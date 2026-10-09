-- =================================================================
--  PLANWAND DARF IN DEN EINSTELLUNGEN FAST ALLES WIE EIN ADMIN
--
--  Was diese Datei tut, in einfachen Worten:
--  Seit 111.124.0 sieht das Konto "Planwand" unter Einstellungen auch
--  Fehlerprotokoll, Farben und Material, Symbole und den Text der
--  Bestellmail (Wunsch Patrick, 9. Oktober 2026). Damit es dort auch
--  speichern kann, darf es:
--    - die Zuordnung Farbe zu Material ändern (Tabelle farb_material)
--    - die Symbole der Planwand ändern (app_config.plan_symbole)
--    - den Text der Bestellmail ändern (app_config.bestellmail_text)
--  Nutzer, Passwörter und PINs bleiben bei Admins.
--  Baut auf planwand-dokumente-sicherung.sql auf (bin_planwand).
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create or replace function public.bin_planwand() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and is_active = true and role = 'planwand');
$$;
revoke all on function public.bin_planwand() from public, anon;
grant execute on function public.bin_planwand() to authenticated;

drop policy if exists "planwand pflegt" on public.farb_material;
create policy "planwand pflegt" on public.farb_material for all to authenticated
  using ((select public.bin_planwand())) with check ((select public.bin_planwand()));

drop policy if exists "planwand einstellungen" on public.app_config;
create policy "planwand einstellungen" on public.app_config for all to authenticated
  using (schluessel in ('plan_symbole', 'bestellmail_text') and (select public.bin_planwand()))
  with check (schluessel in ('plan_symbole', 'bestellmail_text') and (select public.bin_planwand()));

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Farben und Material' as was,
       case when exists (select 1 from pg_policies where tablename = 'farb_material'
                         and policyname = 'planwand pflegt') then 'ok' else 'FEHLT' end as stand
union all select 'Symbole und Bestellmail',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'planwand einstellungen') then 'ok' else 'FEHLT' end;
