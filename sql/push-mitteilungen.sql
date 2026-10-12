-- =================================================================
--  Push-Mitteilungen aufs Handy (Wunsch Patrick, 12. Oktober 2026)
--
--  Admins schicken eine Nachricht, alle Geräte mit eingeschalteten
--  Mitteilungen bekommen sie, auch wenn die App zu ist.
--
--  push_abos        ein Eintrag je Gerät (Adresse des Push-Dienstes
--                   und dessen Schlüssel). Die App liest und schreibt
--                   die Tabelle nie direkt, nur über push_abo_setzen
--                   und push_abo_entfernen: Meldet sich auf einem
--                   Gerät jemand anderes an, gehört der Eintrag danach
--                   der neuen Person.
--  push_nachrichten was wann von wem verschickt wurde.
--  push_schluessel  das Schlüsselpaar des Absenders (VAPID). Erzeugt
--                   die Server-Funktion push-senden beim ersten Aufruf
--                   selbst. Keine Regel für die App: lesen kann ihn
--                   nur der Server, der geheime Teil verlässt ihn nie.
--
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create table if not exists public.push_abos (
  endpoint   text primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  geraet     text,
  erstellt   timestamptz not null default now(),
  geaendert  timestamptz not null default now()
);
alter table public.push_abos enable row level security;

create table if not exists public.push_nachrichten (
  id         bigserial primary key,
  titel      text,
  text       text not null,
  von        uuid references auth.users(id) on delete set null,
  gesendet   timestamptz not null default now(),
  geraete    int not null default 0,
  erreicht   int not null default 0
);
alter table public.push_nachrichten enable row level security;
drop policy if exists push_nachrichten_admin_lesen on public.push_nachrichten;
create policy push_nachrichten_admin_lesen on public.push_nachrichten
  for select to authenticated using (public.bin_admin());

create table if not exists public.push_schluessel (
  id         int primary key default 1 check (id = 1),
  oeffentlich text not null,
  geheim     text not null,
  erstellt   timestamptz not null default now()
);
alter table public.push_schluessel enable row level security;

create or replace function public.push_abo_setzen(p_endpoint text, p_p256dh text, p_auth text, p_geraet text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  insert into push_abos (endpoint, user_id, p256dh, auth, geraet)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_geraet, 200))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        geraet = excluded.geraet, geaendert = now();
end $$;

create or replace function public.push_abo_entfernen(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet'; end if;
  delete from push_abos where endpoint = p_endpoint;
end $$;

-- Wie viele Geräte gerade Mitteilungen bekommen (für den Admin-Knopf)
create or replace function public.push_geraete_zahl()
returns int language sql security definer set search_path = public as $$
  select case when public.bin_admin() then (select count(*)::int from push_abos) else null end
$$;

revoke all on function public.push_abo_setzen(text, text, text, text) from public, anon;
revoke all on function public.push_abo_entfernen(text) from public, anon;
revoke all on function public.push_geraete_zahl() from public, anon;
grant execute on function public.push_abo_setzen(text, text, text, text) to authenticated;
grant execute on function public.push_abo_entfernen(text) to authenticated;
grant execute on function public.push_geraete_zahl() to authenticated;

notify pgrst, 'reload schema';

-- Probe
select case when to_regclass('public.push_abos') is not null
             and to_regclass('public.push_nachrichten') is not null
             and to_regclass('public.push_schluessel') is not null
             and to_regprocedure('public.push_abo_setzen(text,text,text,text)') is not null
        then 'ok' else 'FEHLT' end as push_mitteilungen;
