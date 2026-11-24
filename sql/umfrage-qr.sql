-- =================================================================
--  UMFRAGEN PER QR-CODE OHNE ANMELDUNG
--
--  Wunsch Patrick 24. November 2026: „einen QR-Code generieren, damit
--  man direkt mit dem Smartphone abstimmen kann“, Entscheid „Ohne
--  Anmeldung“.
--   - umfragen.qr: erst wenn ein Admin bei der Umfrage „QR-Code“ drückt,
--     ist sie über den Link erreichbar, sonst nicht.
--   - umfrage_qr_lesen(id): Frage, Bild, Vorschläge und die Zahl der
--     Stimmen je Vorschlag, nie die Namen. Für alle, auch ohne Anmeldung.
--   - umfrage_qr_abstimmen(id, vorschläge, name): wie umfrage_abstimmen,
--     nur ohne Anmeldung, nur bei qr und offen, höchstens 1'000 Stimmen
--     je Umfrage.
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Probe am Ende.
-- =================================================================

alter table public.umfragen add column if not exists qr boolean not null default false;

create or replace function public.umfrage_qr_lesen(p_umfrage uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', u.id, 'titel', u.titel, 'beschreibung', u.beschreibung, 'bild_url', u.bild_url,
    'mehrfach', u.mehrfach, 'offen', u.offen,
    'leute', (select count(distinct lower(s.name)) from public.umfrage_stimmen s where s.umfrage_id = u.id),
    'vorschlaege', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'text', v.text,
        'bild_url', v.bild_url,
        'stimmen', (select count(*) from public.umfrage_stimmen s where s.vorschlag_id = v.id))
        order by v.sort) from public.umfrage_vorschlaege v where v.umfrage_id = u.id), '[]'::jsonb))
  from public.umfragen u where u.id = p_umfrage and u.qr
$$;
grant execute on function public.umfrage_qr_lesen(uuid) to anon, authenticated;

create or replace function public.umfrage_qr_abstimmen(p_umfrage uuid, p_vorschlaege uuid[], p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  u public.umfragen;
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  select * into u from public.umfragen where id = p_umfrage and qr;
  if not found then raise exception 'Umfrage nicht gefunden.'; end if;
  if not u.offen then raise exception 'Die Umfrage ist geschlossen.'; end if;
  if length(n) < 2 then raise exception 'Bitte den Namen eintragen.'; end if;
  if length(n) > 60 then raise exception 'Der Name ist zu lang.'; end if;
  if coalesce(array_length(p_vorschlaege, 1), 0) = 0 then raise exception 'Bitte einen Vorschlag wählen.'; end if;
  if not u.mehrfach and array_length(p_vorschlaege, 1) > 1 then
    raise exception 'Bei dieser Umfrage nur ein Vorschlag.';
  end if;
  if exists (select 1 from unnest(p_vorschlaege) v where not exists (
      select 1 from public.umfrage_vorschlaege x where x.id = v and x.umfrage_id = p_umfrage)) then
    raise exception 'Vorschlag gehört nicht zu dieser Umfrage.';
  end if;
  if (select count(*) from public.umfrage_stimmen where umfrage_id = p_umfrage) >= 1000 then
    raise exception 'Bei dieser Umfrage sind keine weiteren Stimmen möglich.';
  end if;
  delete from public.umfrage_stimmen where umfrage_id = p_umfrage and lower(name) = lower(n);
  insert into public.umfrage_stimmen (umfrage_id, vorschlag_id, name)
    select p_umfrage, v, n from (select distinct unnest(p_vorschlaege) v) s;
end $$;
grant execute on function public.umfrage_qr_abstimmen(uuid, uuid[], text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Probe
select case when exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'umfragen' and column_name = 'qr')
  and exists (select 1 from pg_proc where proname = 'umfrage_qr_lesen')
  and exists (select 1 from pg_proc where proname = 'umfrage_qr_abstimmen')
  then 'ok' else 'FEHLT' end as umfrage_qr;
