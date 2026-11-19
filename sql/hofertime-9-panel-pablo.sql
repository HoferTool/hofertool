-- =================================================================
--  HOFERTIME 9: Pablo am Stempel-Pad
--  Was es tut (Wunsch Patrick 19. November 2026: „auf dem pad soll man
--  nicht sein eigenes bild sehen beim anmelden, mach pablo hin mit dem
--  text SCHAU MIR IN DIE AUGEN“):
--  * Neue Funktion zeit_panel_bild(): gibt dem Stempel-Pad nur die
--    Adresse des Bilds „Pablo“ (Einstellungen → Symbole → Bilder im Pad
--    Mode, Art „Heute noch keine Stückzahl“). Das Panel-Konto darf
--    app_config sonst nicht lesen, darum diese eine Funktion.
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
