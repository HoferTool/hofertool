-- HOFERTIME: Animation nach dem Stempeln für bestimmte Personen
-- (Wunsch Patrick 20. November 2026)
--
-- Was diese Datei tut, in einfachen Worten:
--  * In app_config „zeit_stempel_bild“ steht, wer welche Animation bekommt:
--    {"biber": [Kennungen], "feuerwehr": [Kennungen]}. Die Bilder selbst
--    liegen in der App unter hofertime/stempel/<name>-kommen.webp / -gehen.webp.
--  * zeit_stempel_bild(p_person) gibt den Namen der Animation für diese Person
--    zurück (oder nichts). Fragen darf das Stempel-Panel oder die Person selbst.
-- Gefahrlos mehrfach ausführbar.

create or replace function public.zeit_stempel_bild(p_person uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  k text;
begin
  if p_person is null then return null; end if;
  if not (p_person = auth.uid() or (public.ist_zeit_panel() and public.zeit_panel_person_ok(p_person))) then
    return null;
  end if;
  select (wert::jsonb) into v from app_config where schluessel = 'zeit_stempel_bild';
  if v is null or jsonb_typeof(v) <> 'object' then return null; end if;
  for k in select jsonb_object_keys(v) loop
    if jsonb_typeof(v -> k) = 'array' and (v -> k) ? p_person::text then return k; end if;
  end loop;
  return null;
exception when others then
  return null;
end $$;

grant execute on function public.zeit_stempel_bild(uuid) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'zeit_stempel_bild')
  then 'ok' else 'FEHLT' end as probe;
