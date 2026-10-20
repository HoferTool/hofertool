-- =================================================================
--  MATERIAL: HISTORIE
--  Jede Änderung am Restmaterial (erfasst, geändert, aufgebraucht,
--  zurückgeholt, gelöscht) kommt als Zeile in die Tabelle
--  material_verlauf, mit Wer und Wann. Die Seite Material zeigt mit
--  dem Knopf „Historie“ die letzten 100 (Wunsch Patrick 16. Oktober
--  2026). Was vorher schon da war, wird einmal nachgetragen (erfasst
--  und aufgebraucht). Lesen dürfen alle ausser Externen und Dienst;
--  schreiben tut nur der Auslöser.
--  Mehrfach ausführbar.
-- =================================================================

create table if not exists public.material_verlauf (
  id        bigint generated always as identity primary key,
  posten_id uuid,
  was       text not null,            -- erfasst, geaendert, aufgebraucht, zurueck, geloescht
  material  text,
  menge     numeric,
  einheit   text,
  ort       text,
  vorher    text,                     -- bei „geändert“: was vorher anders war
  wer       uuid references public.profiles (id) on delete set null,
  am        timestamptz not null default now()
);
create index if not exists material_verlauf_am on public.material_verlauf (am desc);

alter table public.material_verlauf enable row level security;
drop policy if exists "material_verlauf lesen" on public.material_verlauf;
create policy "material_verlauf lesen" on public.material_verlauf for select to authenticated
  using (darf_lesen() and not ist_extern() and not bin_dienst());

create or replace function public.material_verlauf_schreiben() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v text := '';
begin
  if tg_op = 'INSERT' then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, wer)
      values (new.id, 'erfasst', new.material, new.menge, new.einheit, new.ort, auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, wer)
      values (old.id, 'geloescht', old.material, old.menge, old.einheit, old.ort, auth.uid());
    return old;
  end if;
  if new.weg_am is not null and old.weg_am is null then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, wer)
      values (new.id, 'aufgebraucht', new.material, new.menge, new.einheit, new.ort, auth.uid());
  elsif new.weg_am is null and old.weg_am is not null then
    insert into material_verlauf (posten_id, was, material, menge, einheit, ort, wer)
      values (new.id, 'zurueck', new.material, new.menge, new.einheit, new.ort, auth.uid());
  else
    if new.material is distinct from old.material then v := v || 'Material ' || coalesce(old.material, '–') || '; '; end if;
    if new.menge is distinct from old.menge or new.einheit is distinct from old.einheit then
      v := v || 'Menge ' || coalesce(trim(trailing '.' from trim(trailing '0' from old.menge::text)) || ' ' || coalesce(old.einheit, ''), '–') || '; ';
    end if;
    if new.ort is distinct from old.ort then v := v || 'Ort ' || coalesce(old.ort, '–') || '; '; end if;
    if new.notiz is distinct from old.notiz then v := v || 'Notiz ' || coalesce(old.notiz, '–') || '; '; end if;
    if new.platz is distinct from old.platz or new.job_id is distinct from old.job_id then v := v || 'Zuweisung geändert; '; end if;
    if v <> '' then
      insert into material_verlauf (posten_id, was, material, menge, einheit, ort, vorher, wer)
        values (new.id, 'geaendert', new.material, new.menge, new.einheit, new.ort, rtrim(v, '; '), auth.uid());
    end if;
  end if;
  return new;
end $$;

create or replace trigger material_posten_verlauf
  after insert or update or delete on public.material_posten
  for each row execute function public.material_verlauf_schreiben();

-- Einmal nachtragen, was schon da war
insert into public.material_verlauf (posten_id, was, material, menge, einheit, ort, wer, am)
  select p.id, 'erfasst', p.material, p.menge, p.einheit, p.ort, p.erstellt_von, coalesce(p.erstellt_am, now())
  from public.material_posten p
  where not exists (select 1 from public.material_verlauf v where v.posten_id = p.id and v.was = 'erfasst');
insert into public.material_verlauf (posten_id, was, material, menge, einheit, ort, wer, am)
  select p.id, 'aufgebraucht', p.material, p.menge, p.einheit, p.ort, p.weg_von, p.weg_am
  from public.material_posten p
  where p.weg_am is not null
    and not exists (select 1 from public.material_verlauf v where v.posten_id = p.id and v.was = 'aufgebraucht');

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_trigger where tgname = 'material_posten_verlauf')
  and exists (select 1 from pg_policies where tablename = 'material_verlauf') then 'ok' else 'FEHLT' end as material_verlauf;
