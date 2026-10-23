-- =================================================================
--  MATERIAL AUS DER NOTIZ ABGESCHALTET (1.158.0)
--
--  Was das tut, in einfachen Worten:
--  Bis jetzt hat die Datenbank eine Material-Bestellung aus der Notiz
--  eines Auftrags („Mat BE: Metalix 2025007893 500kg 24.09.26“) selbst
--  in Menge und Liefertermin eingetragen und aus der Notiz genommen
--  (sql/notiz-material.sql, sql/notiz-ohne-doppel.sql). Diese
--  Übergangsphase ist vorbei (Wunsch Patrick 23. Oktober 2026): Die
--  Notiz bleibt jetzt genau so, wie sie geschrieben wird, und füllt
--  nichts mehr aus. Was schon in Menge und Liefertermin steht, bleibt.
--
--  Der Auslöser bleibt stehen, tut aber nichts mehr (ohne „drop“, das
--  über die Supabase-Verbindung an einer Freigabe hängt). Die
--  Lese-Funktionen bleiben, die Material-Übersicht braucht sie nicht,
--  sie schaden aber nicht.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok
--  oder FEHLT.
-- =================================================================

create or replace function jobs_material_aus_notiz()
returns trigger language plpgsql as $$
begin
  -- Abgeschaltet seit 1.158.0: Notiz füllt nichts mehr aus
  return new;
end $$;

notify pgrst, 'reload schema';


-- ---------- Probe ----------

select 'Notiz füllt nichts mehr aus' as punkt,
  case when pg_get_functiondef('jobs_material_aus_notiz'::regproc) not like '%notiz_material_lesen%'
       then 'ok' else 'FEHLT' end as stand;
