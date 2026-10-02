-- =================================================================
--  WER HAT ZULETZT GEÄNDERT
--
--  Jeder Auftrag merkt sich, wer ihn zuletzt geändert hat und wann.
--  Das erledigt ein Auslöser in der Datenbank selbst — damit wird
--  alles erfasst, was am Auftrag selbst etwas ändert: Speichern im
--  Fenster, Verschieben, Verlängern, Nachrücken, Zustand im Pad Mode.
--  Eine Stückzahlmeldung ändert den Auftrag nicht, sie steht in einer
--  eigenen Tabelle — die zählt hier deshalb nicht als Änderung.
--  Die App zeigt das Kürzel auf dem Balken und Name und Zeit im
--  Infofenster.
--
--  Läuft gefahrlos mehrfach.
-- =================================================================

-- ---------- 1. Zwei Spalten ----------
alter table public.jobs add column if not exists geaendert_von uuid;
alter table public.jobs add column if not exists geaendert_am  timestamptz;


-- ---------- 2. Der Auslöser ----------
create or replace function public.jobs_geaendert_setzen()
returns trigger language plpgsql as $$
begin
  -- Wer angemeldet ist, steht drin; ohne Anmeldung (etwa ein Import im
  -- SQL-Editor) bleibt der bisherige Eintrag
  if auth.uid() is not null then
    new.geaendert_von := auth.uid();
  end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists jobs_geaendert on public.jobs;
create trigger jobs_geaendert
  before insert or update on public.jobs
  for each row execute function public.jobs_geaendert_setzen();


-- ---------- 3. Die Planwand-Sicht bekommt die zwei Spalten ----------
-- Die Sicht wird nicht neu geschrieben, sondern um die zwei Spalten
-- ergänzt. Was sie bisher liefert, bleibt genau gleich — auch der
-- Schutz für Externe.
do $$
declare
  d text;
  invoker boolean;
begin
  if to_regclass('public.planwand') is null then return; end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'planwand'
               and column_name = 'geaendert_von') then return; end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into invoker from pg_class c where c.oid = 'public.planwand'::regclass;

  d := rtrim(pg_get_viewdef('public.planwand'::regclass, true), E'; \n');
  execute 'create or replace view public.planwand as select v.*, '
       || 'jg.geaendert_von, jg.geaendert_am from (' || d || ') v '
       || 'left join public.jobs jg on jg.id = v.id';
  if invoker then
    execute 'alter view public.planwand set (security_invoker = true)';
  end if;
end $$;

notify pgrst, 'reload schema';


-- ---------- 4. Probe ----------
select 'jobs.geaendert_von' as punkt,
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'jobs' and column_name = 'geaendert_von')
            then 'ok' else 'FEHLT' end as ergebnis
union all
select 'Auslöser jobs_geaendert',
       case when exists (select 1 from pg_trigger where tgname = 'jobs_geaendert')
            then 'ok' else 'FEHLT' end
union all
select 'planwand liefert geaendert_von',
       case when exists (select 1 from information_schema.columns where table_schema = 'public'
                         and table_name = 'planwand' and column_name = 'geaendert_von')
            then 'ok' else 'FEHLT' end;
