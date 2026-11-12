-- =================================================================
--  Planer im Pad Mode (seit 1.506.0): eigene Todos
--  Legt die Tabelle planer_todos an. Darin stehen die Todos, die
--  Admins im Planer-Dashboard selbst schreiben (Text, fällig am,
--  erledigt am). Lesen und schreiben nur Admins.
--  Gefahrlos mehrfach ausführbar.
-- =================================================================
create table if not exists public.planer_todos (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  faellig date,
  erledigt_am timestamptz,
  erledigt_von text,
  erstellt_von uuid default auth.uid(),
  erstellt_name text,
  erstellt_am timestamptz not null default now()
);
alter table public.planer_todos enable row level security;
drop policy if exists "planer todos admins" on public.planer_todos;
create policy "planer todos admins" on public.planer_todos
  for all to authenticated using ((select bin_admin())) with check ((select bin_admin()));
grant select, insert, update, delete on public.planer_todos to authenticated;

notify pgrst, 'reload schema';

-- Probe
select case when to_regclass('public.planer_todos') is not null then 'ok' else 'FEHLT' end as planer_todos;
