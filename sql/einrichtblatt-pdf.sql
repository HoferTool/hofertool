-- =================================================================
--  EINRICHTBLÄTTER ALS PDF SICHERN (1.200.0, Wunsch Patrick 26. Oktober 2026)
--
--  Jedes Einrichtblatt aus der App schreibt die App als PDF in einen
--  Ordner, den man unter Einstellungen → Backup wählt
--  (src/teile/ebPdf.js). Einstellung und Stand liegen in app_config:
--    eb_pdf          welches Gerät den Ordner hat
--    eb_pdf_status   wie viele gesichert, Fehler, zuletzt
--
--  Admins dürfen app_config ohnehin ändern. Diese Datei erlaubt zusätzlich
--    - dem Konto Planwand (Rolle planwand): beides einstellen und melden,
--      wie beim Planwand-Archiv
--    - dem Sicherungskonto (app_config.sicherung.konto): den Stand melden
--
--  Gefahrlos mehrfach ausführbar (legt nur an, was fehlt). Am Ende eine
--  Probe mit ok / FEHLT.
-- =================================================================

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'eb pdf') then
    create policy "eb pdf" on public.app_config for all to authenticated
      using (schluessel in ('eb_pdf', 'eb_pdf_status') and (select public.bin_planwand()))
      with check (schluessel in ('eb_pdf', 'eb_pdf_status') and (select public.bin_planwand()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'app_config' and policyname = 'sicherungskonto meldet eb pdf') then
    create policy "sicherungskonto meldet eb pdf" on public.app_config for all to authenticated
      using (schluessel = 'eb_pdf_status' and (select public.sicherung_konto_ich()))
      with check (schluessel = 'eb_pdf_status' and (select public.sicherung_konto_ich()));
  end if;
end $$;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Planwand-Konto' as was,
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'eb pdf') then 'ok' else 'FEHLT' end as stand
union all select 'Sicherungskonto',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                         and policyname = 'sicherungskonto meldet eb pdf') then 'ok' else 'FEHLT' end;
