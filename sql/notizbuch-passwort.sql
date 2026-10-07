-- =================================================================
--  NOTIZBÜCHER MIT PASSWORT
--
--  Ein Notizbuch lässt sich mit einem Passwort sperren. Dann gibt die
--  Datenbank seine Seiten nur heraus, wenn die Person das Passwort
--  eingegeben hat. Das gilt auch für jemanden, der an der App vorbei
--  direkt auf die Datenbank zugreift.
--
--  Was das Skript macht:
--  1. Spalte notizbuecher.gesperrt (ja/nein, für die Anzeige des Schlosses).
--  2. Tabelle notizbuch_schutz: das Passwort, nur verschlüsselt (bcrypt),
--     und die falschen Versuche. Niemand kann sie direkt lesen.
--  3. Tabelle notizbuch_offen: wer welches Buch gerade geöffnet hat
--     (bis das Fenster zugeht, höchstens 8 Stunden).
--  4. Die Seiten gesperrter Bücher sieht und ändert nur, wer sie geöffnet hat.
--  5. Funktionen: notizbuch_oeffnen (Passwort prüfen), notizbuch_zu,
--     notizbuch_passwort (setzen, ändern, entfernen, immer mit dem alten
--     Passwort). Ein gesperrtes Buch ist auch für Admins zu.
--     Nach 5 falschen Versuchen 5 Minuten warten, wie bei der Anmeldung.
--  6. notizbuch_passwort_admin: Nur ein Admin, in der App unter
--     Einstellungen → Notizbücher, setzt ein neues Passwort ohne das
--     alte zu kennen oder hebt die Sperre auf (vergessenes Passwort).
--     Das Buch geht dabei für den Admin nicht auf.
--
--  Voraussetzung: sql/notizbuecher.sql ist ausgeführt.
--  Läuft gefahrlos mehrfach. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

-- ---------- 1. Schloss am Buch ----------
alter table public.notizbuecher add column if not exists gesperrt boolean not null default false;

-- ---------- 2. Passwort (nur verschlüsselt) ----------
create table if not exists public.notizbuch_schutz (
  buch_id      uuid primary key references public.notizbuecher (id) on delete cascade,
  passwort     text not null,
  fehlversuche integer not null default 0,
  warten_bis   timestamptz
);
alter table public.notizbuch_schutz enable row level security;
-- Keine Regel: nur die Funktionen unten kommen daran
revoke all on public.notizbuch_schutz from anon, authenticated;

-- ---------- 3. Wer hat welches Buch offen ----------
create table if not exists public.notizbuch_offen (
  buch_id  uuid not null references public.notizbuecher (id) on delete cascade,
  person   uuid not null,
  bis      timestamptz not null,
  primary key (buch_id, person)
);
alter table public.notizbuch_offen enable row level security;
revoke all on public.notizbuch_offen from anon, authenticated;

-- Darf die angemeldete Person die Seiten dieses Buchs sehen?
create or replace function public.notizbuch_frei(p_buch uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select gesperrt from public.notizbuecher where id = p_buch), false)
      or exists (select 1 from public.notizbuch_offen
                 where buch_id = p_buch and person = auth.uid() and bis > now());
$$;
revoke all on function public.notizbuch_frei(uuid) from public, anon;
grant execute on function public.notizbuch_frei(uuid) to authenticated;

-- ---------- 4. Seiten gesperrter Bücher ----------
drop policy if exists "notizbuch seiten alle" on public.notizbuch_seiten;
create policy "notizbuch seiten alle" on public.notizbuch_seiten
  for all to authenticated
  using (not public.ist_extern() and public.notizbuch_frei(buch_id))
  with check (not public.ist_extern() and public.notizbuch_frei(buch_id));

-- Das Schloss lässt sich nicht von aussen abschalten: gesperrt ändert
-- nur die Funktion notizbuch_passwort, und ein gesperrtes Buch löscht
-- nur, wer es geöffnet hat
create or replace function public.notizbuch_schloss_halten()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.gesperrt and not public.notizbuch_frei(old.id) then
      raise exception 'Notizbuch ist gesperrt: zuerst mit dem Passwort öffnen.';
    end if;
    return old;
  end if;
  if coalesce(current_setting('hofer.notizbuch_passwort', true), '') <> '1' then
    if tg_op = 'INSERT' then new.gesperrt := false;
    else new.gesperrt := old.gesperrt;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notizbuecher_schloss on public.notizbuecher;
create trigger notizbuecher_schloss before insert or update or delete on public.notizbuecher
  for each row execute function public.notizbuch_schloss_halten();

-- ---------- 5. Öffnen, schliessen, Passwort setzen ----------
create or replace function public.notizbuch_oeffnen(p_buch uuid, p_passwort text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.notizbuch_schutz;
begin
  if auth.uid() is null or public.ist_extern() then raise exception 'Nicht erlaubt.'; end if;
  select * into s from public.notizbuch_schutz where buch_id = p_buch for update;
  if not found then return 'ok'; end if;
  if s.warten_bis is not null and s.warten_bis > now() then
    return 'warten:' || ceil(extract(epoch from (s.warten_bis - now())) / 60)::int;
  end if;
  if crypt(coalesce(p_passwort, ''), s.passwort) = s.passwort then
    update public.notizbuch_schutz set fehlversuche = 0, warten_bis = null where buch_id = p_buch;
    insert into public.notizbuch_offen (buch_id, person, bis)
      values (p_buch, auth.uid(), now() + interval '8 hours')
      on conflict (buch_id, person) do update set bis = excluded.bis;
    return 'ok';
  end if;
  update public.notizbuch_schutz
    set fehlversuche = case when s.fehlversuche + 1 >= 5 then 0 else s.fehlversuche + 1 end,
        warten_bis = case when s.fehlversuche + 1 >= 5 then now() + interval '5 minutes' else null end
    where buch_id = p_buch;
  return 'falsch';
end $$;
revoke all on function public.notizbuch_oeffnen(uuid, text) from public, anon;
grant execute on function public.notizbuch_oeffnen(uuid, text) to authenticated;

create or replace function public.notizbuch_zu(p_buch uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.notizbuch_offen where person = auth.uid() and (p_buch is null or buch_id = p_buch);
$$;
revoke all on function public.notizbuch_zu(uuid) from public, anon;
grant execute on function public.notizbuch_zu(uuid) to authenticated;

-- p_neu leer = Sperre aufheben. Ist das Buch gesperrt, braucht es
-- immer das alte Passwort, auch für Admins (Wunsch Patrick 7. Oktober 2026).
create or replace function public.notizbuch_passwort(p_buch uuid, p_alt text, p_neu text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.notizbuch_schutz;
begin
  if auth.uid() is null or public.ist_extern() then raise exception 'Nicht erlaubt.'; end if;
  if not exists (select 1 from public.notizbuecher where id = p_buch) then return 'fehlt'; end if;
  select * into s from public.notizbuch_schutz where buch_id = p_buch for update;
  if found then
    if s.warten_bis is not null and s.warten_bis > now() then
      return 'warten:' || ceil(extract(epoch from (s.warten_bis - now())) / 60)::int;
    end if;
    if crypt(coalesce(p_alt, ''), s.passwort) <> s.passwort then
      update public.notizbuch_schutz
        set fehlversuche = case when s.fehlversuche + 1 >= 5 then 0 else s.fehlversuche + 1 end,
            warten_bis = case when s.fehlversuche + 1 >= 5 then now() + interval '5 minutes' else null end
        where buch_id = p_buch;
      return 'falsch';
    end if;
  end if;
  perform set_config('hofer.notizbuch_passwort', '1', true);
  if coalesce(p_neu, '') = '' then
    delete from public.notizbuch_schutz where buch_id = p_buch;
    update public.notizbuecher set gesperrt = false where id = p_buch;
  else
    if length(p_neu) < 4 then return 'kurz'; end if;
    insert into public.notizbuch_schutz (buch_id, passwort)
      values (p_buch, crypt(p_neu, gen_salt('bf')))
      on conflict (buch_id) do update set passwort = excluded.passwort, fehlversuche = 0, warten_bis = null;
    update public.notizbuecher set gesperrt = true where id = p_buch;
    -- Wer das Passwort setzt, hat das Buch gleich offen
    insert into public.notizbuch_offen (buch_id, person, bis)
      values (p_buch, auth.uid(), now() + interval '8 hours')
      on conflict (buch_id, person) do update set bis = excluded.bis;
  end if;
  perform set_config('hofer.notizbuch_passwort', '', true);
  return 'ok';
end $$;
revoke all on function public.notizbuch_passwort(uuid, text, text) from public, anon;
grant execute on function public.notizbuch_passwort(uuid, text, text) to authenticated;

-- ---------- 6. Admin: neues Passwort ohne das alte, oder Sperre weg ----------
create or replace function public.notizbuch_passwort_admin(p_buch uuid, p_neu text)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null or not public.bin_admin() then raise exception 'Nur für Admins.'; end if;
  if not exists (select 1 from public.notizbuecher where id = p_buch) then return 'fehlt'; end if;
  if coalesce(p_neu, '') <> '' and length(p_neu) < 4 then return 'kurz'; end if;
  perform set_config('hofer.notizbuch_passwort', '1', true);
  if coalesce(p_neu, '') = '' then
    delete from public.notizbuch_schutz where buch_id = p_buch;
    update public.notizbuecher set gesperrt = false where id = p_buch;
  else
    insert into public.notizbuch_schutz (buch_id, passwort)
      values (p_buch, crypt(p_neu, gen_salt('bf')))
      on conflict (buch_id) do update set passwort = excluded.passwort, fehlversuche = 0, warten_bis = null;
    update public.notizbuecher set gesperrt = true where id = p_buch;
    -- Wer das Buch mit dem alten Passwort offen hatte, muss das neue eingeben
    delete from public.notizbuch_offen where buch_id = p_buch;
  end if;
  perform set_config('hofer.notizbuch_passwort', '', true);
  return 'ok';
end $$;
revoke all on function public.notizbuch_passwort_admin(uuid, text) from public, anon;
grant execute on function public.notizbuch_passwort_admin(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ---------- Probe ----------
select 'Spalte gesperrt' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
         and table_name = 'notizbuecher' and column_name = 'gesperrt') then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Passwort-Tabelle geschützt',
       case when to_regclass('public.notizbuch_schutz') is not null
         and not has_table_privilege('authenticated', 'public.notizbuch_schutz', 'select') then 'ok' else 'FEHLT' end
union all
select 'Seiten nur mit Passwort',
       case when exists (select 1 from pg_policies where tablename = 'notizbuch_seiten'
         and policyname = 'notizbuch seiten alle' and qual like '%notizbuch_frei%') then 'ok' else 'FEHLT' end
union all
select 'Funktionen',
       case when to_regprocedure('public.notizbuch_oeffnen(uuid,text)') is not null
         and to_regprocedure('public.notizbuch_passwort(uuid,text,text)') is not null
         and to_regprocedure('public.notizbuch_zu(uuid)') is not null
         and to_regprocedure('public.notizbuch_passwort_admin(uuid,text)') is not null then 'ok' else 'FEHLT' end
union all
select 'Schloss lässt sich nicht umgehen',
       case when exists (select 1 from pg_trigger where tgname = 'notizbuecher_schloss') then 'ok' else 'FEHLT' end;
