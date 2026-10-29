-- =================================================================
--  INFOBOARD: ECHTE CHROME-FENSTER AM PC
--
--  Viele Webseiten lassen sich nicht in der App einbetten (Wunsch
--  Patrick 29. Oktober 2026: „kannst du nicht den Browser anzeigen?“).
--  Darum legt das Programm skripte/infoboard-fenster.ps1 am Infoboard-PC
--  ein echtes Chrome-Fenster genau über so ein Feld.
--
--  Die Anzeige am Bildschirm meldet hier, wo auf dem Bildschirm welche
--  Seite stehen soll (in Bildpunkten), etwa jede Minute. Das Programm am
--  PC liest das ohne Anmeldung, es braucht dort kein Passwort. Lesbar
--  sind nur die Adressen und Lagen dieser Felder, sonst nichts.
--
--  Läuft gefahrlos mehrfach (nichts wird gelöscht). Am Ende eine Probe
--  mit ok / FEHLT.
-- =================================================================

create table if not exists public.infoboard_fenster (
  board text primary key,
  fenster jsonb not null default '[]'::jsonb,
  gemeldet timestamptz not null default now()
);
alter table public.infoboard_fenster enable row level security;

-- Melden: jeder Angemeldete ausser Externen (die Anzeige läuft mit dem
-- Konto Infoboard, Rolle mitarbeiter)
create or replace function public.infoboard_fenster_melden(p_board text, p_fenster jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.darf_lesen() or public.ist_extern() then
    raise exception 'Keine Berechtigung';
  end if;
  if p_board not in ('haupt', 'empfang') then raise exception 'Unbekannter Bildschirm'; end if;
  insert into public.infoboard_fenster (board, fenster, gemeldet)
    values (p_board, coalesce(p_fenster, '[]'::jsonb), now())
    on conflict (board) do update set fenster = excluded.fenster, gemeldet = now();
end $$;

-- Lesen: auch ohne Anmeldung, für das Programm am PC; dazu die
-- Serverzeit, damit es veraltete Meldungen erkennt
create or replace function public.infoboard_fenster_lesen(p_board text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('fenster', coalesce((select fenster from public.infoboard_fenster where board = p_board), '[]'::jsonb),
    'alter_s', coalesce(extract(epoch from now() - (select gemeldet from public.infoboard_fenster where board = p_board)), 999999));
$$;

revoke all on function public.infoboard_fenster_melden(text, jsonb) from public, anon;
grant execute on function public.infoboard_fenster_melden(text, jsonb) to authenticated;
grant execute on function public.infoboard_fenster_lesen(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Probe
select case when to_regclass('public.infoboard_fenster') is not null
  and exists (select 1 from pg_proc where proname = 'infoboard_fenster_melden')
  and exists (select 1 from pg_proc where proname = 'infoboard_fenster_lesen')
  then 'ok' else 'FEHLT' end as infoboard_fenster;
