-- =================================================================
--  MAILKONTO: FERIEN UND BESTELLUNGEN DIREKT SENDEN
--  Wunsch Patrick 31. Oktober 2026: Ferien sollen von selbst in Outlook
--  stehen und Bestell-PDFs direkt rausgehen, über ein gemeinsames
--  Konto (1.programmierung@hoferco.ch, Microsoft 365).
--
--  Was diese Datei tut:
--   · Tabelle mail_konto: eine Zeile mit den Angaben der App-Anmeldung
--     bei Microsoft (Mandant, Anwendungs-ID, geheimer Schlüssel) und
--     dem Absender. Niemand kann sie über die App lesen, nur die
--     Server-Funktion „mail-senden“ mit dem geheimen Supabase-Schlüssel.
--   · mail_konto_status(): ob das Konto eingerichtet ist und der
--     Absender, für alle Angemeldeten (ohne Schlüssel).
--   · mail_konto_lesen() / mail_konto_setzen(): nur Admins; der
--     geheime Schlüssel kommt nie zurück, nur „hinterlegt ja/nein“.
--   · vacations.outlook_id: der Termin in Outlook zu einem Ferieneintrag,
--     damit Verschieben und Löschen ihn nachführen.
--   · order_items.gesendet_am / gesendet_von: wann und von wem eine
--     Bestellung per Mail rausging.
--   · mail_protokoll: was die App verschickt hat (ohne Inhalt).
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create table if not exists public.mail_konto (
  id           int primary key default 1 check (id = 1),
  mandant      text,
  client_id    text,
  geheimnis    text,
  absender     text,
  name         text,
  geprueft_am  timestamptz,
  fehler       text,
  geaendert_am timestamptz default now(),
  geaendert_von uuid
);
alter table public.mail_konto enable row level security;
-- Bewusst keine Regeln: über die App weder lesen noch schreiben
revoke all on public.mail_konto from anon, authenticated;

create or replace function public.mail_konto_status()
returns table (aktiv boolean, absender text, name text)
language sql stable security definer set search_path = public as $$
  select coalesce(k.mandant <> '' and k.client_id <> '' and k.geheimnis <> '' and k.absender <> '', false),
         k.absender, k.name
  from (select 1) x left join public.mail_konto k on k.id = 1
  where auth.uid() is not null and not public.ist_extern()
$$;

create or replace function public.mail_konto_lesen()
returns table (mandant text, client_id text, absender text, name text,
               hat_geheimnis boolean, geprueft_am timestamptz, fehler text)
language sql stable security definer set search_path = public as $$
  select k.mandant, k.client_id, k.absender, k.name,
         coalesce(k.geheimnis, '') <> '', k.geprueft_am, k.fehler
  from public.mail_konto k where k.id = 1 and public.bin_admin()
$$;

-- geheimnis leer oder null = den bisherigen behalten
create or replace function public.mail_konto_setzen(p_mandant text, p_client_id text,
  p_geheimnis text, p_absender text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.bin_admin() then raise exception 'Nur Admins dürfen das Mailkonto ändern'; end if;
  insert into public.mail_konto (id, mandant, client_id, geheimnis, absender, name, geaendert_am, geaendert_von)
  values (1, trim(p_mandant), trim(p_client_id), nullif(trim(coalesce(p_geheimnis, '')), ''),
          lower(trim(p_absender)), trim(p_name), now(), auth.uid())
  on conflict (id) do update set
    mandant = excluded.mandant, client_id = excluded.client_id,
    geheimnis = coalesce(excluded.geheimnis, mail_konto.geheimnis),
    absender = excluded.absender, name = excluded.name,
    geprueft_am = null, fehler = null,
    geaendert_am = now(), geaendert_von = auth.uid();
end $$;

revoke all on function public.mail_konto_status() from public, anon;
revoke all on function public.mail_konto_lesen() from public, anon;
revoke all on function public.mail_konto_setzen(text, text, text, text, text) from public, anon;
grant execute on function public.mail_konto_status() to authenticated;
grant execute on function public.mail_konto_lesen() to authenticated;
grant execute on function public.mail_konto_setzen(text, text, text, text, text) to authenticated;

alter table public.vacations add column if not exists outlook_id text;
alter table public.order_items add column if not exists gesendet_am timestamptz;
alter table public.order_items add column if not exists gesendet_von uuid;

create table if not exists public.mail_protokoll (
  id       bigint generated always as identity primary key,
  am       timestamptz not null default now(),
  von      uuid,
  art      text,
  an       text,
  betreff  text,
  ok       boolean,
  fehler   text
);
alter table public.mail_protokoll enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'mail_protokoll' and policyname = 'mail_protokoll lesen') then
    create policy "mail_protokoll lesen" on public.mail_protokoll for select to authenticated
      using ((select public.bin_admin()));
  end if;
end $$;

notify pgrst, 'reload schema';

select case when
  to_regclass('public.mail_konto') is not null
  and to_regclass('public.mail_protokoll') is not null
  and exists (select 1 from information_schema.columns where table_name = 'vacations' and column_name = 'outlook_id')
  and exists (select 1 from information_schema.columns where table_name = 'order_items' and column_name = 'gesendet_am')
  and to_regprocedure('public.mail_konto_setzen(text,text,text,text,text)') is not null
then 'ok' else 'FEHLT' end as probe;
