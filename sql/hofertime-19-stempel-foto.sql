-- HOFERTIME: Animation mit Foto nach dem Stempeln (Wunsch Patrick 23. November 2026)
--
-- Was diese Datei tut, in einfachen Worten:
--  * Animationen mit dem Foto einer Person dürfen nicht ins öffentliche
--    Repository. Sie stehen darum nur hier in der Datenbank, in app_config
--    „zeit_stempel_foto“: {"<name>-kommen" | "<name>-gehen": "data:image/webp;base64,…"}.
--  * zeit_stempel_foto(p_name, p_art) gibt das Bild zurück, wenn es eines gibt.
--    Fragen darf das Stempel-Panel oder die Person, die diese Animation hat
--    (steht in app_config „zeit_stempel_bild“ bei diesem Namen).
--  * Ohne Eintrag zeigt die App wie bisher die Datei hofertime/stempel/<name>-<art>.webp.
-- Gefahrlos mehrfach ausführbar.

create or replace function public.zeit_stempel_foto(p_name text, p_art text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  b jsonb;
begin
  if p_name is null or p_name !~ '^[a-z0-9-]+$' or p_art not in ('kommen', 'gehen') then return null; end if;
  if not public.ist_zeit_panel() then
    select (wert::jsonb) into v from app_config where schluessel = 'zeit_stempel_bild';
    if v is null or jsonb_typeof(v -> p_name) <> 'array' or not ((v -> p_name) ? auth.uid()::text) then
      return null;
    end if;
  end if;
  select (wert::jsonb) into b from app_config where schluessel = 'zeit_stempel_foto';
  if b is null or jsonb_typeof(b) <> 'object' then return null; end if;
  return b ->> (p_name || '-' || p_art);
exception when others then
  return null;
end $$;

grant execute on function public.zeit_stempel_foto(text, text) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'zeit_stempel_foto')
  then 'ok' else 'FEHLT' end as probe;
