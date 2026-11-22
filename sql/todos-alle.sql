-- Todos für alle (Wunsch Patrick 22. November 2026, Version 1.707.0)
-- Bisher sahen und schrieben nur Admins die eigenen Todos (planer_todos).
-- Neu darf jede Person ausser Externen, Dienst und reinen HOFERTIME-Konten
-- Todos anlegen, entweder „Nur für mich“ oder „Für alle“. Admins können
-- zusätzlich „Alle Admins“ wählen; solche Todos sehen andere Personen nicht.
-- Spalte sicht: 'ich', 'admins' oder 'alle'. Bisherige Todos: nur für mich
-- bleibt 'ich', die anderen werden 'admins' (wie bisher).
-- Gefahrlos mehrfach ausführbar.

alter table public.planer_todos add column if not exists sicht text;
update public.planer_todos set sicht = case when fuer_alle is false then 'ich' else 'admins' end where sicht is null;
-- Ältere Fassungen der App schicken nur fuer_alle: daraus die Sicht setzen
create or replace function public.planer_todos_sicht() returns trigger
language plpgsql as $$
begin
  if new.sicht is null then
    new.sicht := case when new.fuer_alle is false then 'ich' else 'admins' end;
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'planer_todos_sicht' and tgrelid = 'public.planer_todos'::regclass) then
    create trigger planer_todos_sicht before insert on public.planer_todos
      for each row execute function public.planer_todos_sicht();
  end if;
end $$;

create or replace function public.todo_darf() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not public.ist_extern() and not public.bin_dienst() and not coalesce(public.ist_nur_zeit(), false)
$$;
grant execute on function public.todo_darf() to authenticated;

-- Ohne drop (über die Supabase-Verbindung hängt drop an einer Freigabe):
-- die bisherige Regel „planer todos admins“ (für alles) wird umgeschrieben,
-- dazu zwei einschränkende Regeln für Anlegen und Löschen.
alter policy "planer todos admins" on public.planer_todos
  using ((select todo_darf()) and (erstellt_von = (select auth.uid()) or sicht = 'alle'
    or (coalesce(sicht, 'admins') = 'admins' and (select bin_admin()))))
  with check ((select todo_darf()) and (sicht in ('ich', 'alle') or (select bin_admin())));

do $$ begin
  if not exists (select 1 from pg_policy where polname = 'todos anlegen eigen' and polrelid = 'public.planer_todos'::regclass) then
    create policy "todos anlegen eigen" on public.planer_todos as restrictive for insert to authenticated
      with check (erstellt_von = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policy where polname = 'todos loeschen eigen' and polrelid = 'public.planer_todos'::regclass) then
    create policy "todos loeschen eigen" on public.planer_todos as restrictive for delete to authenticated
      using (erstellt_von = (select auth.uid()) or (select bin_admin()));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'planer_todos' and column_name = 'sicht')
  and exists (select 1 from pg_policy where polname = 'todos loeschen eigen') then 'ok' else 'FEHLT' end as todos_alle;
