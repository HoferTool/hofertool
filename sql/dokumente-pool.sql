-- =================================================================
--  DOKUMENTE-POOL UND NETZLAUFWERK: DIENSTKONTO DARF SEINEN STAND MELDEN
--
--  Die Programme dokumente-pool.ps1 und dokumente-abgleich.ps1 melden
--  sich mit einem Dienstkonto an (Rolle "dienst"). Nach jedem
--  Durchlauf schreiben sie ihren Stand in die Einstellungen, damit er
--  in der App unter Einstellungen → Dokumente erscheint. Die
--  Einstellungen darf sonst nur ein Admin ändern. Dieses Skript
--  erlaubt die Rolle "dienst" und lässt das Dienstkonto genau diese
--  zwei Einträge schreiben, sonst nichts.
--
--  Ohne dieses Skript laden die Programme trotzdem hoch, nur der Stand
--  fehlt in der App.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- Rolle "dienst" erlauben (dasselbe wie dienstkonto.sql)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role is null or role in ('admin', 'planwand', 'langdreher', 'kurzdreher',
                                  'mitarbeiter', 'produktion', 'extern', 'dienst')) not valid;

-- Ist die angemeldete Person das Dienstkonto?
create or replace function public.bin_dienst() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and is_active = true and role = 'dienst');
$$;

drop policy if exists "dienst meldet stand" on public.app_config;
create policy "dienst meldet stand" on public.app_config for all to authenticated
  using (schluessel in ('dok_pfad_status', 'dok_pool_status', 'eb_ordner_status') and (select public.bin_dienst()))
  with check (schluessel in ('dok_pfad_status', 'dok_pool_status', 'eb_ordner_status') and (select public.bin_dienst()));

notify pgrst, 'reload schema';

-- Probe
select 'Rolle dienst erlaubt' as punkt,
       case when exists (select 1 from pg_constraint where conname = 'profiles_role_check'
                           and pg_get_constraintdef(oid) ilike '%dienst%') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Dienstkonto meldet Stand',
       case when exists (select 1 from pg_policies where tablename = 'app_config'
                           and policyname = 'dienst meldet stand') then 'ok' else 'FEHLT' end;
