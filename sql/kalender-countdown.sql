-- Kalender: Häkchen „Schon jetzt zeigen, mit Tagen bis dahin“ (Countdown).
-- Ein Eintrag mit Häkchen steht auf der Startseite und dem Infoboard schon
-- bis ein Jahr vorher, mit „noch 41 Tage“. Gesetzt für den letzten
-- Arbeitstag am 18. Dezember 2026. Mehrfach ausführbar.
alter table kalender add column if not exists countdown boolean not null default false;
update kalender set countdown = true where datum = '2026-12-18' and countdown = false;
notify pgrst, 'reload schema';
select case when exists (select 1 from information_schema.columns
  where table_name = 'kalender' and column_name = 'countdown') then 'ok' else 'FEHLT' end as probe;
