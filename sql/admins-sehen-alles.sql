-- Alle Admins sehen alles (Wunsch Patrick 24. November 2026: „alle admins
-- alles sehen können, ausser zahlen spiel“)
--
-- Was diese Datei tut: Kalkulation, Test ERP und QMS waren in der Datenbank
-- nur mit einem Vermerk am Konto lesbar (kalkulationSehen, erpSehen,
-- qmSehen). Jetzt dürfen das auch alle Admins ohne Vermerk. Externe nie.
-- Der Zahlensprint (reihenSehen) bleibt, wie er ist.
-- Gefahrlos mehrfach ausführbar, ohne drop.

create or replace function public.kalkulation_darf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.role = 'admin' or coalesce((p.einstellungen->>'kalkulationSehen')::boolean, false))
                          and p.role is distinct from 'extern'
                     from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.erp_darf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.role = 'admin' or coalesce((p.einstellungen->>'erpSehen')::boolean, false))
                          and p.role is distinct from 'extern'
                     from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.qm_darf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (p.role = 'admin' or coalesce((p.einstellungen->>'qmSehen')::boolean, false))
                          and p.role is distinct from 'extern'
                     from public.profiles p where p.id = auth.uid()), false);
$$;

notify pgrst, 'reload schema';

-- Probe: ok, wenn alle drei Funktionen die Admin-Regel kennen
select case when count(*) = 3 then 'ok' else 'FEHLT' end as probe
  from pg_proc
 where proname in ('kalkulation_darf', 'erp_darf', 'qm_darf')
   and pg_get_functiondef(oid) like '%role = ''admin''%';
