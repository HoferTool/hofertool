-- Neue FAs der Planwand kommen von selbst ins Test ERP (Wunsch Patrick
-- 27. November 2026: „ja ich will neue FAs übernehmen“). Ergänzt
-- sql/erp-fa-aus-planwand.sql (einmalige Übernahme der bestehenden).
--
-- Sobald ein Auftrag auf der Planwand eine FA Nr. (Jahr + 6 Ziffern) bekommt
-- oder geändert wird, legt der Auslöser den Fertigungsauftrag mit dieser
-- Nummer an (Artikel mit derselben HOCO Nr., Arbeitsplan, Sollmenge, Index aus
-- der WBG), sofern es ihn noch nicht gibt. Gibt es ihn schon (aus der Planwand),
-- schreibt er nur Maschine und Stand nach, und ist der Auftrag fertig, wird der
-- FA abgeschlossen. Arbeitsgänge, Menge und Buchungen im ERP bleiben unberührt.
-- Fehler im Auslöser werden geschluckt: Speichern auf der Planwand darf daran
-- nie scheitern. Mehrfach ausführbar.

create or replace function public.erp_fa_aus_job() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a record; m record; bid uuid; b record;
begin
  if coalesce(new.fa_nr, '') !~ '^20\d{8}$' then return new; end if;
  -- Nur wenn sich wirklich etwas geändert hat (Festplatte schonen)
  if tg_op = 'UPDATE' and (old.fa_nr, old.job_number, old.plan_status, old.machine_id, old.planned_from, old.planned_days, old.ended_at)
     is not distinct from (new.fa_nr, new.job_number, new.plan_status, new.machine_id, new.planned_from, new.planned_days, new.ended_at) then
    return new;
  end if;
  begin
    select name, machine_number into m from machines where id = new.machine_id;
    select * into b from erp_belege where typ = 'fertigung' and nr = new.fa_nr;
    if found then
      if (b.daten->>'aus_planwand') = 'true' then
        update erp_belege set
          daten = jsonb_set(daten, '{planwand}', coalesce(daten->'planwand', '{}'::jsonb) || jsonb_build_object(
            'job_id', new.id, 'maschine', m.name, 'maschine_nr', m.machine_number, 'stand', new.plan_status,
            'start', new.planned_from, 'tage', new.planned_days, 'beendet', new.ended_at)),
          status = case when new.plan_status = 'fertig' and status = 'offen' then 'abgeschlossen' else status end,
          geaendert_am = now()
        where id = b.id;
      end if;
      return new;
    end if;
    select * into a from erp_artikel a0 where a0.art = 'hofer' and a0.nr = new.job_number
      order by (a0.idx = new.wbg_index) desc, (jsonb_array_length(coalesce(a0.arbeitsplan, '[]'::jsonb)) > 0) desc,
               a0.aktiv desc, a0.geaendert_am desc nulls last
      limit 1;
    if not found then return new; end if;
    insert into erp_belege (typ, nr, partner_id, art, status, datum, daten)
    values ('fertigung', new.fa_nr, a.kunde_id, 'einzel',
      case when new.plan_status = 'fertig' then 'abgeschlossen' else 'offen' end,
      coalesce(new.planned_from, new.started_at::date, current_date),
      jsonb_build_object(
        'ap', coalesce((select jsonb_agg(x || jsonb_build_object('erledigt_am', 'null'::jsonb))
               from jsonb_array_elements(coalesce(a.arbeitsplan, '[]'::jsonb)) x), '[]'::jsonb),
        'aus_planwand', true,
        'planwand', jsonb_build_object('job_id', new.id, 'artikel_id', a.id, 'maschine', m.name, 'maschine_nr', m.machine_number,
          'stand', new.plan_status, 'start', new.planned_from, 'tage', new.planned_days, 'beendet', new.ended_at)))
    returning id into bid;
    insert into erp_positionen (beleg_id, pos, artikel_id, menge, einheit, termin, daten)
    values (bid, 10, a.id, coalesce(new.target_quantity, 0), coalesce(a.einheit, 'Stk'),
      case when new.planned_from is not null then new.planned_from + ceil(coalesce(new.planned_days, 1) * 7.0 / 5)::int end,
      jsonb_build_object('idx', case when coalesce(new.wbg_index, '') not in ('', '-', '?') then new.wbg_index else coalesce(a.idx, '') end));
  exception when others then
    raise warning 'erp_fa_aus_job: %', sqlerrm;
  end;
  return new;
end $$;

create or replace trigger jobs_erp_fa
  after insert or update of fa_nr, job_number, plan_status, machine_id, planned_from, planned_days, ended_at on public.jobs
  for each row execute function public.erp_fa_aus_job();

notify pgrst, 'reload schema';

select case when exists (select 1 from pg_trigger where tgname = 'jobs_erp_fa') then 'ok' else 'FEHLT' end as probe;
