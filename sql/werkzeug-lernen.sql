-- =================================================================
--  WERKZEUGWAHL LERNT (1.872.0, Wunsch Patrick 26. November 2026)
--
--  Was das tut, in einfachen Worten:
--  Wählt jemand bei „Werkzeug wählen“ (Einrichtblatt) oder in der
--  Bestellposition einen Artikel, merkt sich die App hier, wie das
--  Werkzeug vorher hiess (Text aus dem alten Excel, der vorherige
--  Artikel oder das Eingetippte) und welcher Artikel dann gewählt
--  wurde. Beim nächsten Mal schlägt sie diesen Artikel vor, auch wenn
--  der Text gar nicht ähnlich ist. Dazu merkt sie sich, wenn ein alter
--  Lieferant jetzt anders heisst (etwa „SM Tool“ → „Applitec“).
--
--  Tabelle werkzeug_gelernt: eine Zeile je alter Text und Artikel,
--  „anzahl“ zählt, wie oft das gewählt wurde.
--  Funktion werkzeug_lernen(…) zählt hoch oder legt neu an.
--  Lesen dürfen alle ausser Externen und Dienst, lernen alle mit
--  Schreibrecht ausser Externen.
--  Gefahrlos mehrfach ausführbar. Am Ende eine Probe mit ok / FEHLT.
-- =================================================================

create table if not exists public.werkzeug_gelernt (
  alt_norm        text not null,
  article_id      uuid not null references public.articles (id) on delete cascade,
  alt_text        text,
  alt_hersteller  text,
  anzahl          integer not null default 1,
  zuletzt_am      timestamptz not null default now(),
  zuletzt_von     uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (alt_norm, article_id)
);
create index if not exists werkzeug_gelernt_artikel on public.werkzeug_gelernt (article_id);

alter table public.werkzeug_gelernt enable row level security;
drop policy if exists "lesen" on public.werkzeug_gelernt;
create policy "lesen" on public.werkzeug_gelernt for select to authenticated
  using ((select public.darf_lesen()) and coalesce((select public.meine_rolle()), '') not in ('extern', 'dienst'));
drop policy if exists "anlegen" on public.werkzeug_gelernt;
create policy "anlegen" on public.werkzeug_gelernt for insert to authenticated
  with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
drop policy if exists "aendern" on public.werkzeug_gelernt;
create policy "aendern" on public.werkzeug_gelernt for update to authenticated
  using ((select public.darf_schreiben()) and not (select public.ist_extern()))
  with check ((select public.darf_schreiben()) and not (select public.ist_extern()));
drop policy if exists "loeschen" on public.werkzeug_gelernt;
create policy "loeschen" on public.werkzeug_gelernt for delete to authenticated
  using ((select public.darf_schreiben()) and not (select public.ist_extern()));

create or replace function public.werkzeug_lernen(p_norm text, p_artikel uuid, p_text text, p_hersteller text)
returns void language sql security invoker set search_path = public as $$
  insert into public.werkzeug_gelernt (alt_norm, article_id, alt_text, alt_hersteller)
  values (p_norm, p_artikel, p_text, nullif(p_hersteller, ''))
  on conflict (alt_norm, article_id) do update
    set anzahl = werkzeug_gelernt.anzahl + 1,
        alt_text = excluded.alt_text,
        alt_hersteller = coalesce(excluded.alt_hersteller, werkzeug_gelernt.alt_hersteller),
        zuletzt_am = now(),
        zuletzt_von = auth.uid();
$$;
grant execute on function public.werkzeug_lernen(text, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

select case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'werkzeug_gelernt')
  and exists (select 1 from pg_proc where proname = 'werkzeug_lernen') then 'ok' else 'FEHLT' end as probe;
