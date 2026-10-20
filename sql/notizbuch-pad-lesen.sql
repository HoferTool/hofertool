-- =================================================================
--  NOTIZBÜCHER IM PAD MODE OHNE PASSWORT LESEN
--
--  Ein Notizbuch, das einem Maschinenpark zugewiesen ist (Spalte
--  parks, sql/notizbuch-parks.sql), lässt sich im Pad Mode an den
--  Maschinen dieses Parks lesen, auch wenn es mit Passwort gesperrt
--  ist (Wunsch Patrick 15. Oktober 2026: „wenn ein Buch einem Park
--  zugewiesen ist, braucht es dort kein PIN oder PW zum Lesen“).
--  Ausserhalb des Pad Mode bleibt die Sperre wie bisher.
--
--  Was das Skript macht: Funktion notizbuch_pad_seiten(buch, park)
--  gibt die Seiten eines Buchs nur zum Lesen heraus, wenn das Buch
--  diesem Park zugewiesen ist. Nicht für Externe. Schreiben geht
--  darüber nicht.
--
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create or replace function public.notizbuch_pad_seiten(p_buch uuid, p_park uuid)
returns table (id uuid, buch_id uuid, titel text, reihenfolge integer, inhalt jsonb,
               erstellt_am timestamptz, geaendert_am timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.id, s.buch_id, s.titel, s.reihenfolge, s.inhalt, s.erstellt_am, s.geaendert_am
  from public.notizbuch_seiten s
  join public.notizbuecher b on b.id = s.buch_id
  where s.buch_id = p_buch
    and p_park = any (b.parks)
    and auth.uid() is not null
    and not public.ist_extern()
  order by s.reihenfolge, s.erstellt_am;
$$;

revoke all on function public.notizbuch_pad_seiten(uuid, uuid) from public, anon;
grant execute on function public.notizbuch_pad_seiten(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Funktion notizbuch_pad_seiten' as punkt,
       case when to_regprocedure('public.notizbuch_pad_seiten(uuid, uuid)') is not null
       then 'ok' else 'FEHLT' end as ergebnis;
