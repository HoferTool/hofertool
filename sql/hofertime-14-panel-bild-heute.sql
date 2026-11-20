-- =================================================================
--  HOFERTIME 14: Ersatzbild für Pablo an einem Tag
--  Wunsch Patrick 20. November 2026: „für heute das Bild beim Stempeln
--  als Ersatz für Pablo nehmen“.
--  * zeit_panel_bild() schaut zuerst in app_config „zeit_panel_bild_heute“
--    = {"datum": "JJJJ-MM-TT", "bild": "<Adresse oder data:-Bild>"}.
--    Nur an genau diesem Tag (Zeit Zürich) gilt dieses Bild, sonst Pablo.
--  * Das Bild selbst steht nur in der Datenbank, nie im Repository.
--  Gefahrlos mehrfach ausführbar, ohne drop.
-- =================================================================

create or replace function public.zeit_panel_bild()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  b text;
begin
  if not public.ist_zeit_panel() then return null; end if;
  select (wert::jsonb) into v from app_config where schluessel = 'zeit_panel_bild_heute';
  if v is not null and v ->> 'datum' = to_char(now() at time zone 'Europe/Zurich', 'YYYY-MM-DD')
     and nullif(v ->> 'bild', '') is not null then
    return v ->> 'bild';
  end if;
  select (wert::jsonb) -> 'stueckzahl' into v from app_config where schluessel = 'pad_mahnbilder';
  if v is null then return null; end if;
  b := nullif(v ->> 'bild', '');
  if b is null and nullif(v ->> 'person', '') is not null then
    select bild_url into b from profiles where id = (v ->> 'person')::uuid;
  end if;
  return b;
exception when others then
  return null;
end $$;

revoke all on function public.zeit_panel_bild() from public, anon;
grant execute on function public.zeit_panel_bild() to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_proc where proname = 'zeit_panel_bild')
  then 'ok' else 'FEHLT' end as probe;
