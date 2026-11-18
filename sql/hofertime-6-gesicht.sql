-- =================================================================
--  HOFERTIME: Gesichtserkennung am Stempel-Panel (seit 1.631.0,
--  Wunsch Patrick 18. November 2026: „könnten wir auch Gesichtserkennung
--  machen?“, Datenschutz-Hinweis: „das ist kein Problem“)
--
--  Was die Datei tut:
--  - Tabelle zeit_gesichter: je Person das Zahlenmuster des Gesichts
--    (je Aufnahme 128 Zahlen, höchstens 10 Aufnahmen), KEIN Foto.
--    Dazu wann die Person eingewilligt hat und wer eingelernt hat.
--  - Lesen darf nur die Person selbst und der Admin von HOFERTIME
--    (zeit_admin), und das Stempel-Panel über zeit_panel_gesichter.
--  - Einlernen und Löschen nur über die Funktionen
--    zeit_gesicht_setzen / zeit_gesicht_loeschen: die Person selbst oder
--    der Admin von HOFERTIME, nie Externe und Dienst.
--  Gefahrlos mehrfach ausführbar. Am Schluss eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.zeit_gesichter (
  person_id uuid primary key references public.profiles(id) on delete cascade,
  muster jsonb not null,
  einverstanden_am timestamptz not null default now(),
  erstellt_am timestamptz not null default now(),
  erstellt_von uuid default auth.uid()
);
alter table public.zeit_gesichter enable row level security;

-- ohne drop, damit es über die Supabase-Verbindung ohne Freigabe geht
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'zeit_gesichter' and policyname = 'zeit gesichter lesen') then
    create policy "zeit gesichter lesen" on public.zeit_gesichter for select to authenticated
      using ((select zeit_admin()) or person_id = (select auth.uid()));
  end if;
end $$;

create or replace function public.zeit_gesicht_setzen(p_person uuid, p_muster jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare rolle text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then
    raise exception 'Nur die Person selbst oder der Admin von HOFERTIME';
  end if;
  select role into rolle from public.profiles where id = p_person;
  if rolle is null or rolle in ('extern', 'dienst') then raise exception 'Diese Person erfasst keine Zeiten'; end if;
  if jsonb_typeof(p_muster) <> 'array' or jsonb_array_length(p_muster) not between 1 and 10 then
    raise exception 'Muster ungültig';
  end if;
  insert into public.zeit_gesichter (person_id, muster, einverstanden_am, erstellt_am, erstellt_von)
    values (p_person, p_muster, now(), now(), auth.uid())
    on conflict (person_id) do update set muster = excluded.muster,
      einverstanden_am = excluded.einverstanden_am, erstellt_am = excluded.erstellt_am,
      erstellt_von = excluded.erstellt_von;
  return true;
end $$;

create or replace function public.zeit_gesicht_loeschen(p_person uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not (public.zeit_admin() or p_person = auth.uid()) then
    raise exception 'Nur die Person selbst oder der Admin von HOFERTIME';
  end if;
  delete from public.zeit_gesichter where person_id = p_person;
  return true;
end $$;

-- Das Panel bekommt nur die Muster der Personen, die dort stempeln dürfen
create or replace function public.zeit_panel_gesichter()
returns table (person_id uuid, muster jsonb)
language sql stable security definer set search_path = public as $$
  select g.person_id, g.muster from public.zeit_gesichter g
  where public.ist_zeit_panel() and public.zeit_panel_person_ok(g.person_id);
$$;

revoke all on function public.zeit_gesicht_setzen(uuid, jsonb) from public, anon;
revoke all on function public.zeit_gesicht_loeschen(uuid) from public, anon;
revoke all on function public.zeit_panel_gesichter() from public, anon;
grant execute on function public.zeit_gesicht_setzen(uuid, jsonb) to authenticated;
grant execute on function public.zeit_gesicht_loeschen(uuid) to authenticated;
grant execute on function public.zeit_panel_gesichter() to authenticated;

notify pgrst, 'reload schema';

select case when to_regclass('public.zeit_gesichter') is not null
  and exists (select 1 from pg_proc where proname = 'zeit_panel_gesichter')
  and exists (select 1 from pg_proc where proname = 'zeit_gesicht_setzen')
  then 'ok' else 'FEHLT' end as probe;
