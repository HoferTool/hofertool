-- Alte Sicherung abschalten (1.873.1, 27. November 2026)
--
-- Was das tut: Die Funktion sicherung_lesen holte früher alle Tabellen auf
-- einmal in den Arbeitsspeicher der Datenbank. In der Nacht auf den
-- 27. November 2026 riefen alte, nicht neu geladene Tabs sie nochmals auf,
-- die Datenbank fiel dreimal aus. Seit 1.871.0 sichert die App stückweise
-- (sicherung_liste / sicherung_teil). Diese Datei lässt sicherung_lesen nur
-- noch einen Fehler melden, damit kein alter Tab die Datenbank mehr überlastet.
-- Gefahrlos mehrfach ausführbar.

create or replace function public.sicherung_lesen()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Alte Sicherung abgeschaltet. Bitte App neu laden (Strg + F5).';
end;
$$;

revoke all on function public.sicherung_lesen() from public, anon;
grant execute on function public.sicherung_lesen() to authenticated, service_role;

notify pgrst, 'reload schema';

-- Probe: ok, wenn sicherung_lesen nur noch einen Fehler meldet
select case when position('raise exception' in prosrc) > 0 then 'ok' else 'FEHLT' end as probe
from pg_proc where proname = 'sicherung_lesen';
