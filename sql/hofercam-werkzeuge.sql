-- =================================================================
--  HOFERCAM: Bibliothek reale Werkzeuge (seit 1.695.0)
--  Wunsch Patrick 22. November 2026: Werkzeuge aus den Artikeln und den
--  Werkzeugprotokollen für die Simulation, mit Artikel-Nr., Plattendicke,
--  und was nicht erkannt ist, von Hand ergänzen.
--
--  Was diese Datei tut:
--  1. Tabelle cam_werkzeuge: je Werkzeug (Artikel oder Text aus den
--     Einrichtblättern) die von Hand ergänzten Masse für die Simulation.
--     Was die App selbst aus dem Artikel erkennt, steht hier nicht.
--  2. Lesen alle ausser Externen, ändern alle mit Schreibrecht.
--  3. Funktion cam_wz_nutzung(): wie oft jedes Werkzeug in den
--     Einrichtblättern steht (nur Zählung, keine Teile oder Kunden).
--  Gefahrlos mehrfach ausführbar.
-- =================================================================

create table if not exists public.cam_werkzeuge (
  schluessel text primary key,          -- „a:<Artikel-Id>“ oder „t:<Text>“
  article_id uuid references public.articles(id) on delete cascade,
  text text,
  wz jsonb,                             -- Werkzeug wie b.wz, null = kein Werkzeug für die Simulation
  kein boolean not null default false,  -- „kein Werkzeug für die Simulation“
  geaendert_von uuid default auth.uid(),
  geaendert_am timestamptz not null default now()
);

alter table public.cam_werkzeuge enable row level security;

drop policy if exists "cam_wz lesen" on public.cam_werkzeuge;
create policy "cam_wz lesen" on public.cam_werkzeuge for select
  using ((select darf_lesen()) and not (select ist_extern()));
drop policy if exists "cam_wz anlegen" on public.cam_werkzeuge;
create policy "cam_wz anlegen" on public.cam_werkzeuge for insert
  with check ((select darf_schreiben()) and not (select ist_extern()));
drop policy if exists "cam_wz aendern" on public.cam_werkzeuge;
create policy "cam_wz aendern" on public.cam_werkzeuge for update
  using ((select darf_schreiben()) and not (select ist_extern()))
  with check ((select darf_schreiben()) and not (select ist_extern()));
drop policy if exists "cam_wz loeschen" on public.cam_werkzeuge;
create policy "cam_wz loeschen" on public.cam_werkzeuge for delete
  using ((select darf_schreiben()) and not (select ist_extern()));

-- Nutzung in den Einrichtblättern: Artikel-Id oder Text, mit Anzahl
create or replace function public.cam_wz_nutzung()
returns table (article_id text, hersteller text, werkzeug text, anzahl bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(v->>'article_id', ''),
         max(trim(coalesce(v->>'hersteller', ''))),
         regexp_replace(trim(v->>'werkzeug'), '\s+', ' ', 'g'),
         count(*)
  from einrichtblatt_app, jsonb_each(plaetze) e(k, v)
  where trim(coalesce(v->>'werkzeug', '')) <> ''
  group by 1, 3
$$;
grant execute on function public.cam_wz_nutzung() to authenticated;

notify pgrst, 'reload schema';

select case when to_regclass('public.cam_werkzeuge') is not null
  and exists (select 1 from pg_proc where proname = 'cam_wz_nutzung') then 'ok' else 'FEHLT' end as probe;
