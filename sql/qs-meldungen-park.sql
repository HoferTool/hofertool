-- =================================================================
--  QS-MELDUNGEN NUR FÜR DEN EIGENEN PARK (1.85.0, Wunsch Patrick
--  16. Oktober 2026: „wenn Ausschuss gemeldet wird, soll man es nur
--  für seinen Park sehen, ausser Admin“)
--
--  Was das tut, in einfachen Worten:
--  Gemeldeten Ausschuss sieht, meldet und quittiert jede Person nur
--  noch an Maschinen aus ihren eigenen Parks, also denselben, die sie
--  in der Produktion sieht. Admins und die Gerätekonten mit Rolle
--  Planwand (Planwand, Pad Mode an den Maschinen) sehen alles.
--  Externe sehen weiterhin gar nichts.
--
--  Eigene Parks wie in der App (parkErlaubt in src/alt/app.js):
--  zugewiesene Parks unter Einstellungen → Nutzer; ohne Zuweisung
--  Kurzdreher die Parks mit „kurz“, Langdreher die mit „lang“ im
--  Namen, alle anderen alles.
--
--  Ohne drop: die bestehende Regel wird nur geändert (alter policy).
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create or replace function public.qs_darf_maschine(m_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((
    select case
      when p.role = 'extern' then false
      when p.role in ('admin', 'planwand') then true
      when coalesce(cardinality(p.parks), 0) > 0 then m.park_id = any (p.parks)
      when p.role = 'kurzdreher' then coalesce(k.name ilike '%kurz%', false)
      when p.role = 'langdreher' then coalesce(k.name ilike '%lang%', false)
      else true
    end
    from public.profiles p
    left join public.machines m on m.id = m_id
    left join public.machine_parks k on k.id = m.park_id
    where p.id = auth.uid()), false)
$$;

grant execute on function public.qs_darf_maschine(uuid) to authenticated;

alter policy "qs_meldungen alle" on public.qs_meldungen
  using (public.qs_darf_maschine(machine_id))
  with check (public.qs_darf_maschine(machine_id));

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Funktion qs_darf_maschine' as punkt,
       case when to_regprocedure('public.qs_darf_maschine(uuid)') is not null then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Regel nach Park',
       case when exists (select 1 from pg_policies where tablename = 'qs_meldungen'
                         and policyname = 'qs_meldungen alle' and qual like '%qs_darf_maschine%') then 'ok' else 'FEHLT' end;
