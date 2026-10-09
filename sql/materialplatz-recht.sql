-- =================================================================
--  MATERIALPLATZ NUR MIT HÄKCHEN  (seit 1.5.0)
--
--  Was diese Datei macht:
--  1. Neues Häkchen "Materialplatz bearbeiten" an jedem Konto
--     (profiles.darf_materialplatz). Admins dürfen es immer, alle
--     anderen nur mit Häkchen (Wunsch Patrick, 9. Oktober 2026).
--  2. Das Häkchen setzt nur ein Admin, niemand bei sich selbst.
--  3. Die Datenbank lässt den Materialplatz eines Auftrags
--     (jobs.material_platz) nur von Admins, Leuten mit Häkchen und dem
--     Dienstkonto ändern. Alle anderen bekommen eine verständliche
--     Fehlermeldung. Änderungen im Supabase-Dashboard gehen immer.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

-- ---------- 1. Häkchen ----------
alter table public.profiles add column if not exists darf_materialplatz boolean not null default false;

create or replace function public.darf_materialplatz()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and is_active = true
      and (role in ('admin', 'dienst') or darf_materialplatz = true));
$$;
grant execute on function public.darf_materialplatz() to authenticated;

-- ---------- 2. Nur ein Admin setzt das Häkchen ----------
-- Eigener Auslöser neben profil_schutz, damit beide unabhängig bleiben
create or replace function public.profil_materialplatz_schutz()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.darf_materialplatz is distinct from old.darf_materialplatz and not public.bin_admin() then
    raise exception 'Das Häkchen „Materialplatz bearbeiten“ setzt nur ein Admin';
  end if;
  return new;
end $$;

drop trigger if exists trg_profil_materialplatz on public.profiles;
create trigger trg_profil_materialplatz before update on public.profiles
  for each row execute function public.profil_materialplatz_schutz();

-- ---------- 3. Materialplatz am Auftrag ----------
create or replace function public.jobs_materialplatz_recht()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.material_platz, '') = '' or public.darf_materialplatz() then return new; end if;
  elsif new.material_platz is not distinct from old.material_platz or public.darf_materialplatz() then
    return new;
  end if;
  raise exception 'Den Materialplatz ändern nur Admins und wer das Häkchen „Materialplatz bearbeiten“ hat';
end $$;

drop trigger if exists jobs_materialplatz_recht on public.jobs;
create trigger jobs_materialplatz_recht before insert or update of material_platz on public.jobs
  for each row execute function public.jobs_materialplatz_recht();

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select was, case when da then 'ok' else 'FEHLT' end as stand from (values
  ('Häkchen darf_materialplatz', exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'darf_materialplatz')),
  ('Schutz am Häkchen', exists (select 1 from pg_trigger where tgname = 'trg_profil_materialplatz')),
  ('Schutz am Auftrag', exists (select 1 from pg_trigger where tgname = 'jobs_materialplatz_recht'))
) as p(was, da);
