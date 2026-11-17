-- =================================================================
--  UMFRAGEN AUF DER STARTSEITE
--
--  Wunsch Patrick 17. November 2026: „ein Umfrage-Tool … Vorschläge
--  machen, abstimmen nicht mit dem Benutzerprofil, sondern mit Namen,
--  auch Bilder einfügen“.
--   - umfragen: Frage, Beschreibung, Bild, ob mehrere Vorschläge
--     gewählt werden dürfen, ob sie noch offen ist
--   - umfrage_vorschlaege: die Vorschläge, je mit Text und Bild
--   - umfrage_stimmen: eine Zeile je Name und gewähltem Vorschlag
--  Umfragen anlegen, ändern, schliessen, löschen nur Admins. Lesen alle
--  Angemeldeten ausser Externen und Dienst. Abgestimmt wird nur über
--  die Funktion umfrage_abstimmen: wer mit demselben Namen nochmals
--  abstimmt, ersetzt seine Stimme (Gross/klein und Leerzeichen zählen
--  nicht), und nur solange die Umfrage offen ist.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Probe am Ende.
-- =================================================================

create table if not exists public.umfragen (
  id            uuid primary key default gen_random_uuid(),
  titel         text not null,
  beschreibung  text,
  bild_url      text,
  mehrfach      boolean not null default false,
  offen         boolean not null default true,
  sort          int not null default 0,
  erstellt_am   timestamptz not null default now(),
  erstellt_von  uuid default auth.uid(),
  geschlossen_am timestamptz
);

create table if not exists public.umfrage_vorschlaege (
  id          uuid primary key default gen_random_uuid(),
  umfrage_id  uuid not null references public.umfragen(id) on delete cascade,
  text        text not null,
  bild_url    text,
  sort        int not null default 0
);
create index if not exists umfrage_vorschlaege_umfrage on public.umfrage_vorschlaege (umfrage_id);

create table if not exists public.umfrage_stimmen (
  id            uuid primary key default gen_random_uuid(),
  umfrage_id    uuid not null references public.umfragen(id) on delete cascade,
  vorschlag_id  uuid not null references public.umfrage_vorschlaege(id) on delete cascade,
  name          text not null,
  erstellt_am   timestamptz not null default now()
);
create index if not exists umfrage_stimmen_umfrage on public.umfrage_stimmen (umfrage_id);

alter table public.umfragen enable row level security;
alter table public.umfrage_vorschlaege enable row level security;
alter table public.umfrage_stimmen enable row level security;
grant select, insert, update, delete on public.umfragen, public.umfrage_vorschlaege to authenticated;
grant select, delete on public.umfrage_stimmen to authenticated;

do $$
declare t text;
begin
  foreach t in array array['umfragen', 'umfrage_vorschlaege', 'umfrage_stimmen'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = t || ' lesen') then
      execute format('create policy %I on public.%I for select to authenticated using '
        || '((select public.darf_lesen()) and not (select public.ist_extern()) '
        || 'and coalesce((select public.meine_rolle()), '''') <> ''dienst'')', t || ' lesen', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = t and policyname = t || ' admin') then
      execute format('create policy %I on public.%I for all to authenticated '
        || 'using ((select public.bin_admin())) with check ((select public.bin_admin()))', t || ' admin', t);
    end if;
  end loop;
end $$;

-- Abstimmen mit Namen statt Profil
create or replace function public.umfrage_abstimmen(p_umfrage uuid, p_vorschlaege uuid[], p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  u public.umfragen;
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not (public.darf_lesen() and not public.ist_extern()
      and coalesce(public.meine_rolle(), '') <> 'dienst') then
    raise exception 'Keine Berechtigung zum Abstimmen.';
  end if;
  if length(n) < 2 then raise exception 'Bitte den Namen eintragen.'; end if;
  if length(n) > 60 then raise exception 'Der Name ist zu lang.'; end if;
  select * into u from public.umfragen where id = p_umfrage;
  if not found then raise exception 'Umfrage nicht gefunden.'; end if;
  if not u.offen then raise exception 'Die Umfrage ist geschlossen.'; end if;
  if coalesce(array_length(p_vorschlaege, 1), 0) = 0 then raise exception 'Bitte einen Vorschlag wählen.'; end if;
  if not u.mehrfach and array_length(p_vorschlaege, 1) > 1 then
    raise exception 'Bei dieser Umfrage nur ein Vorschlag.';
  end if;
  if exists (select 1 from unnest(p_vorschlaege) v where not exists (
      select 1 from public.umfrage_vorschlaege x where x.id = v and x.umfrage_id = p_umfrage)) then
    raise exception 'Vorschlag gehört nicht zu dieser Umfrage.';
  end if;
  delete from public.umfrage_stimmen where umfrage_id = p_umfrage and lower(name) = lower(n);
  insert into public.umfrage_stimmen (umfrage_id, vorschlag_id, name)
    select p_umfrage, v, n from (select distinct unnest(p_vorschlaege) v) s;
end $$;
revoke all on function public.umfrage_abstimmen(uuid, uuid[], text) from public, anon;
grant execute on function public.umfrage_abstimmen(uuid, uuid[], text) to authenticated;

notify pgrst, 'reload schema';

-- Probe
select case when (select count(*) from information_schema.tables where table_schema = 'public'
    and table_name in ('umfragen', 'umfrage_vorschlaege', 'umfrage_stimmen')) = 3
  and (select count(*) from pg_policies where schemaname = 'public'
    and tablename in ('umfragen', 'umfrage_vorschlaege', 'umfrage_stimmen')) = 6
  and exists (select 1 from pg_proc where proname = 'umfrage_abstimmen')
  then 'ok' else 'FEHLT' end as umfragen;
