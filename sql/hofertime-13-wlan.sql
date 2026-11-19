-- =================================================================
--  HOFERTIME: Stempeln über einen persönlichen Link (WLAN am iPhone)
--  Wunsch Patrick 19. November 2026: „Zeit erfassen, sobald ich im WLAN
--  hoferco bin, und stoppen, wenn ich weg bin“.
--
--  Eine Webseite sieht das WLAN nicht. Das iPhone (App Kurzbefehle) ruft
--  beim Verbinden bzw. Trennen einen persönlichen Link auf. Der Link
--  enthält einen langen Zufallsschlüssel; gespeichert ist nur sein
--  Fingerabdruck (sha256) in zeit_links, für niemanden lesbar.
--
--  zeit_link_erstellen()        neuer Schlüssel für die angemeldete Person
--                               (ersetzt den alten), gibt ihn einmal zurück
--  zeit_link_stand()            wann der Link erstellt wurde (oder leer)
--  zeit_link_loeschen()         Link abschalten
--  zeit_wlan_stempeln(s, art)   vom Server (Funktion zeit-wlan) aufgerufen:
--    kommen: ist die Person schon da, nichts; war ein Gehen über den Link
--            vor weniger als 10 Minuten, wird es gelöscht (kurz kein WLAN
--            in der Halle), sonst Kommen.
--    gehen:  nur wenn die Person da ist.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
create table if not exists public.zeit_links (
  person_id uuid primary key references public.profiles(id) on delete cascade,
  hash text not null unique,
  erstellt_am timestamptz not null default now()
);
alter table public.zeit_links enable row level security;
-- keine Regeln: über die App liest und schreibt niemand direkt

create or replace function public.zeit_link_erstellen() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and role in ('extern', 'dienst')) then
    raise exception 'Nicht erlaubt';
  end if;
  s := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.zeit_links (person_id, hash, erstellt_am)
    values (auth.uid(), encode(digest(s, 'sha256'), 'hex'), now())
    on conflict (person_id) do update set hash = excluded.hash, erstellt_am = now();
  return s;
end $$;

create or replace function public.zeit_link_stand() returns timestamptz
language sql security definer set search_path = public stable as $$
  select erstellt_am from public.zeit_links where person_id = auth.uid();
$$;

create or replace function public.zeit_link_loeschen() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.zeit_links where person_id = auth.uid();
  return true;
end $$;

create or replace function public.zeit_wlan_stempeln(p_schluessel text, p_art text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  p uuid;
  l public.zeit_stempel;
begin
  if p_schluessel is null or length(p_schluessel) < 32 then return 'unbekannt'; end if;
  select person_id into p from public.zeit_links where hash = encode(digest(p_schluessel, 'sha256'), 'hex');
  if p is null then return 'unbekannt'; end if;
  if p_art not in ('kommen', 'gehen') then return 'art'; end if;
  select * into l from public.zeit_stempel where person_id = p and zeit <= now() order by zeit desc limit 1;
  if p_art = 'kommen' then
    -- schon da (heute eingestempelt)
    if l.id is not null and l.art = 'kommen' and (l.zeit at time zone 'Europe/Zurich')::date = (now() at time zone 'Europe/Zurich')::date then
      return 'schon da';
    end if;
    -- nur kurz kein WLAN: das Gehen von vorhin fällt weg
    if l.id is not null and l.art = 'gehen' and l.quelle = 'wlan' and l.zeit > now() - interval '10 minutes' then
      delete from public.zeit_stempel where id = l.id;
      return 'weiter da';
    end if;
    insert into public.zeit_stempel (person_id, art, zeit, quelle, geraet, erstellt_von)
      values (p, 'kommen', now(), 'wlan', 'iPhone WLAN', p);
    return 'kommen';
  end if;
  if l.id is null or l.art = 'gehen' then return 'schon weg'; end if;
  insert into public.zeit_stempel (person_id, art, zeit, quelle, geraet, erstellt_von)
    values (p, 'gehen', now(), 'wlan', 'iPhone WLAN', p);
  return 'gehen';
end $$;

revoke all on function public.zeit_wlan_stempeln(text, text) from public, anon, authenticated;
grant execute on function public.zeit_wlan_stempeln(text, text) to service_role;
grant execute on function public.zeit_link_erstellen() to authenticated;
grant execute on function public.zeit_link_stand() to authenticated;
grant execute on function public.zeit_link_loeschen() to authenticated;

notify pgrst, 'reload schema';

select case when to_regclass('public.zeit_links') is not null
  and to_regprocedure('public.zeit_wlan_stempeln(text,text)') is not null
  and to_regprocedure('public.zeit_link_erstellen()') is not null then 'ok' else 'FEHLT' end as probe;
