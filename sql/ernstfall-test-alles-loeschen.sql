-- =================================================================
--  ERNSTFALL-TEST: ALLE DATEN DER APP LÖSCHEN
--
--  ACHTUNG: Das löscht wirklich. Es gibt kein Rückgängig.
--  Zurück kommt alles nur über die Sicherung der App:
--  Einstellungen → Backup → Zurückspielen.
--
--  Wunsch Patrick, 9. Oktober 2026: „ein SQL, wobei ich alles löschen
--  kann, das Schlimmste, was passieren kann, und dann das Backup
--  zurückspielen und schauen, ob es geht“.
--
--  Was gelöscht wird:
--    - jede Tabelle, die in der Sicherung steckt (Planwand, Aufträge,
--      HOCO Nummern, Stückzahlen, Bestellungen, Einkauf, Notizen,
--      Notizbücher, Ferien, Materialausgabe, Solarwerte, Dokumente-Liste …)
--    - alle Einstellungen in app_config
--
--  Was stehen bleibt, damit man nach dem Löschen überhaupt noch
--  hineinkommt und zurückspielen darf:
--    - die Konten und Personen (profiles, Anmeldung, Passwörter, PINs);
--      ohne sie weiss die Datenbank nicht mehr, wer Admin oder Planwand
--      ist, und niemand dürfte zurückspielen
--    - in app_config die Einstellungen der Sicherung selbst (Ordner,
--      Sicherungsgerät) und der PIN der Planwand
--    - alle Dateien in der Ablage (WBGs, Bilder, Zeichnungen,
--      Einrichtblätter): Supabase lässt Dateien nicht per SQL löschen
--
--  Danach ist die App leer: keine Aufträge, keine Maschinen, keine
--  Notizen. Das ist gewollt.
-- =================================================================

begin;

-- Einstellungen weg, ausser Sicherung und PIN der Planwand
delete from public.app_config
where schluessel not like 'sicherung%'
  and schluessel <> 'planwand_pin';

-- Alle anderen Tabellen der Sicherung leeren, ausser app_config
-- (oben) und profiles (Konten). Ohne „cascade“: Würde etwas an den
-- Konten hängen, bricht es ab, statt sie mitzunehmen.
do $$
declare liste text;
begin
  select string_agg(format('public.%I', t), ', ')
    into liste
  from unnest(public.sicherung_tabellenliste()) t
  where t not in ('app_config', 'profiles');
  execute 'truncate table ' || liste;
end $$;

commit;

-- Probe: zeigt je Tabelle, wie viele Zeilen noch da sind.
-- Erwartet: überall 0, ausser profiles (Konten) und app_config (2 bis 3).
select tabelle, zeilen,
       case when tabelle in ('profiles', 'app_config') then 'bleibt'
            when zeilen = 0 then 'ok, leer'
            else 'FEHLT, nicht leer' end as probe
from (
  select t as tabelle,
         (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t), false, true, '')))[1]::text::bigint as zeilen
  from unnest(public.sicherung_tabellenliste()) t
) z
order by (zeilen > 0 and tabelle not in ('profiles', 'app_config')) desc, tabelle;
