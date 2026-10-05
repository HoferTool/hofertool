-- =================================================================
--  EINRICHTBLATT-ORDNER: DIENSTKONTO DARF SEINEN STAND MELDEN
--
--  Das Programm einrichtblaetter.ps1 liest die Excel-Einrichtblätter
--  aus den Typ-Ordnern (Einstellungen → Dokumente → Einrichtblatt-
--  Ordner). Nach jedem Durchlauf, auch im Probelauf, schreibt es in
--  die Einstellungen, was es gefunden hat und was es hochladen würde.
--  Damit die App das zeigen kann, darf das Dienstkonto nun auch den
--  Eintrag "eb_ordner_status" schreiben, sonst weiterhin nichts.
--
--  Ohne dieses Skript läuft das Programm trotzdem, nur sieht man den
--  Probelauf dann nicht in der App, sondern nur im Protokoll
--  C:\Hofer\Abgleich\einrichtblaetter.log.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

drop policy if exists "dienst meldet stand" on public.app_config;
create policy "dienst meldet stand" on public.app_config for all to authenticated
  using (schluessel in ('dok_pfad_status', 'dok_pool_status', 'eb_ordner_status') and (select public.bin_dienst()))
  with check (schluessel in ('dok_pfad_status', 'dok_pool_status', 'eb_ordner_status') and (select public.bin_dienst()));

notify pgrst, 'reload schema';

-- Probe
select 'Dienstkonto meldet Einrichtblatt-Stand' as punkt,
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                           and policyname = 'dienst meldet stand'
                           and qual ilike '%eb_ordner_status%') then 'ok' else 'FEHLT' end as ergebnis;
