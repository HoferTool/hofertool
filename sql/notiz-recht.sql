-- =================================================================
--  NOTIZ FÜR DIE MASCHINE MIT EIGENEM HÄKCHEN  (seit 1.333.0)
--
--  Was diese Datei macht:
--  1. Neues Häkchen "Notiz bearbeiten" an jedem Konto
--     (profiles.darf_notiz). Damit darf die Person im Auftragsfenster
--     die "Notiz für die Maschine" ändern, sonst nichts dazu
--     (Wunsch Patrick 2. November 2026: "Tristan darf das bearbeiten").
--     Admins und wer "Materialplatz bearbeiten" hat, dürfen es weiterhin.
--  2. Das Häkchen setzt nur ein Admin, niemand bei sich selbst.
--  3. Setzt das Häkchen bei Tristan Ecker.
--
--  Gefahrlos mehrfach ausführbar. Am Ende steht eine Probe mit ok/FEHLT.
-- =================================================================

alter table public.profiles add column if not exists darf_notiz boolean not null default false;

create or replace function public.profil_notiz_schutz()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.darf_notiz is distinct from old.darf_notiz and not public.bin_admin() then
    raise exception 'Das Häkchen „Notiz bearbeiten“ setzt nur ein Admin';
  end if;
  return new;
end $$;

create or replace trigger trg_profil_notiz before update on public.profiles
  for each row execute function public.profil_notiz_schutz();

update public.profiles set darf_notiz = true
  where full_name = 'Tristan Ecker' and darf_notiz = false;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select was, case when da then 'ok' else 'FEHLT' end as stand from (values
  ('Häkchen darf_notiz', exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'darf_notiz')),
  ('Schutz am Häkchen', exists (select 1 from pg_trigger where tgname = 'trg_profil_notiz')),
  ('Tristan darf', exists (select 1 from public.profiles where full_name = 'Tristan Ecker' and darf_notiz))
) as p(was, da);
