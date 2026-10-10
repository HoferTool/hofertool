-- =================================================================
--  PLANWAND-ARCHIV (1.22.0, Wunsch Patrick 10. Oktober 2026)
--
--  Jeden Tag schreibt die App eine Datei mit der ganzen Planwand in
--  einen eigenen Ordner (src/teile/planwandArchiv.js). Einstellung und
--  Stand liegen in app_config:
--    planwand_archiv         Uhrzeit, wie lange behalten, welches Gerät
--    planwand_archiv_status  letzte Datei, Fehler, Liste im Ordner
--
--  Admins dürfen app_config ohnehin ändern. Diese Datei erlaubt zusätzlich
--    - dem Konto Planwand (Rolle planwand): beides einstellen und melden,
--      wie bei der Sicherung (sql/planwand-dokumente-sicherung.sql)
--    - dem Sicherungskonto (app_config.sicherung.konto): den Stand melden,
--      wie bei der Sicherung (sql/sicherung-konto.sql)
--
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

drop policy if exists "planwand archiv" on public.app_config;
create policy "planwand archiv" on public.app_config for all to authenticated
  using (schluessel in ('planwand_archiv', 'planwand_archiv_status') and (select public.bin_planwand()))
  with check (schluessel in ('planwand_archiv', 'planwand_archiv_status') and (select public.bin_planwand()));

drop policy if exists "sicherungskonto meldet archiv" on public.app_config;
create policy "sicherungskonto meldet archiv" on public.app_config for all to authenticated
  using (schluessel = 'planwand_archiv_status' and (select public.sicherung_konto_ich()))
  with check (schluessel = 'planwand_archiv_status' and (select public.sicherung_konto_ich()));

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Planwand-Konto' as was,
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'planwand archiv') then 'ok' else 'FEHLT' end as stand
union all select 'Sicherungskonto',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'sicherungskonto meldet archiv') then 'ok' else 'FEHLT' end;
