-- HOFERTIME: Profilbilder am Stempel-Pad (Wunsch Patrick 23. November 2026:
-- „wenn man dort alle sieht, auch die Bilder sieht, wie beim Login“).
-- zeit_panel_personen gab bisher kein Bild zurück (null). Jetzt das Profilbild
-- wie bei den Kacheln der Anmeldung (profiles.bild_url). Sonst unverändert.
-- Gefahrlos mehrfach ausführbar.
create or replace function public.zeit_panel_personen()
 returns table(id uuid, full_name text, bild_url text, da boolean, seit timestamp with time zone)
 language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.full_name, p.bild_url,
    coalesce(l.art = 'kommen' and l.zeit > now() - interval '16 hours', false),
    case when l.art = 'kommen' then l.zeit end
  from public.profiles p
  left join lateral (select s.art, s.zeit from public.zeit_stempel s
    where s.person_id = p.id and s.zeit <= now() order by s.zeit desc limit 1) l on true
  where public.ist_zeit_panel()
    and coalesce(p.is_active, true) and p.role not in ('extern', 'dienst')
    and not coalesce(p.andere_nutzer, false)
  order by p.full_name;
$function$;

notify pgrst, 'reload schema';

select case when position('p.bild_url' in pg_get_functiondef('public.zeit_panel_personen'::regproc)) > 0
  then 'ok' else 'FEHLT' end as probe;
