-- =================================================================
--  Ohne Anmeldung nichts lesen (3. November 2026)
-- =================================================================
--  Der Schlüssel der App ist öffentlich (er steht im Code). Ohne
--  Anmeldung liessen sich damit bisher ein paar alte Sichten lesen,
--  die die App gar nicht mehr braucht: laufende Aufträge (179 Zeilen),
--  der alte infoBoard-Import (2'593 Zeilen) und der Aufbau der Typen.
--  Diese Datei sperrt sie für alle, die nicht angemeldet sind, und
--  lässt sie nur noch mit den Rechten der lesenden Person laufen.
--  Die Anmeldeseite (login_kacheln) und die Solaranlage bleiben, wie
--  sie sind. Nichts wird gelöscht. Gefahrlos mehrfach ausführbar.
-- =================================================================

revoke select on public.laufende_auftraege, public.ib_gedeutet, public.typ_aufbau,
  public.ib_ueberlappungen, public.ib_neu_gedeutet, public.bestand_je_platz,
  public.bewegungen_lesbar, public.kontrolle_lesbar from anon;

alter view public.laufende_auftraege set (security_invoker = on);
alter view public.ib_gedeutet set (security_invoker = on);
alter view public.typ_aufbau set (security_invoker = on);
alter view public.ib_ueberlappungen set (security_invoker = on);
alter view public.bestand_je_platz set (security_invoker = on);
alter view public.bewegungen_lesbar set (security_invoker = on);
alter view public.kontrolle_lesbar set (security_invoker = on);

-- Diese Funktionen prüfen selbst auf Admin, ohne Anmeldung braucht sie niemand
revoke execute on function public.maschine_hart_loeschen(uuid), public.park_hart_loeschen(uuid),
  public.qs_ausschuss_nachtragen(jsonb, boolean) from anon, public;

notify pgrst, 'reload schema';

select 'Alte Sichten ohne Anmeldung gesperrt' as probe,
       case when not has_table_privilege('anon', 'public.laufende_auftraege', 'select')
             and not has_table_privilege('anon', 'public.ib_gedeutet', 'select')
             and has_table_privilege('anon', 'public.login_kacheln', 'select')
            then 'ok' else 'FEHLT' end as stand;
