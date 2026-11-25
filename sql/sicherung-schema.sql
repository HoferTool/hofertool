-- ============================================================================
--  Bauplan der Datenbank für die Sicherung (Plan B, 25. November 2026)
-- ============================================================================
--  Was es tut:
--  Die tägliche Sicherung (ZIP) enthielt bisher nur die Daten: alle Tabellen
--  mit ihren Zeilen und die hochgeladenen Dateien. Wie die Datenbank gebaut
--  ist (Tabellen mit ihren Spalten, Funktionen, Ansichten, Auslöser, Regeln
--  wer was sehen darf, Rechte, Ablagen, Realtime), stand nirgends am Stück.
--  Ohne diesen Bauplan liesse sich aus dem ZIP keine neue Datenbank machen.
--
--  Neu schreibt die Funktion sicherung_schema() den ganzen Bauplan als Text,
--  so wie er gerade ist. Die App legt ihn bei jeder Sicherung als
--  "schema.sql" ins ZIP. Auf einem neuen Supabase (Cloud oder eigener
--  Server) im SQL Editor ausgeführt, entsteht dieselbe leere Datenbank,
--  danach kommen die Daten mit "Zurückspielen" oder sicherung-zu-sql.py.
--
--  Gefahrlos mehrfach ausführbar. Es ändert nichts an Daten oder Regeln.
-- ============================================================================

-- Hülle: führt einen Befehl aus und meldet nur, wenn er nicht geht, statt
-- den ganzen Bauplan abzubrechen (z.B. Erweiterung fehlt auf dem Server).
create or replace function public.sicherung_schema_sicher(befehl text)
returns text
language sql
immutable
set search_path = ''
as $$
  select format(
    E'do $hoferx$ begin execute %L; exception when others then raise notice %L, sqlerrm; end $hoferx$;\n',
    befehl,
    'nicht angelegt (' || left(regexp_replace(befehl, '\s+', ' ', 'g'), 80) || '): %'
  );
$$;

create or replace function public.sicherung_schema()
returns text
language plpgsql
stable
security definer
-- leerer Suchpfad: so stehen alle Namen mit Schema (public.jobs) im Text
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  s text := '';
  r record;
  spalten text;
  fertig oid[] := '{}';
  runde int;
  neu boolean;
  sichten oid[] := '{}';
begin
  if not (public.bin_admin() or public.bin_planwand() or public.bin_dienst()
          or public.sicherung_konto_ich()
          or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'Nur Admins, Planwand und das Sicherungskonto dürfen sichern.';
  end if;

  s := s || '-- Bauplan HoferTool, erstellt ' || to_char(now() at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI') || E'\n'
         || E'-- Im SQL Editor eines neuen Supabase-Projekts ausführen, danach die Daten zurückspielen.\n'
         || E'set check_function_bodies = off;\nset client_min_messages = warning;\n\n';

  -- 1. Erweiterungen
  s := s || E'-- Erweiterungen\n';
  for r in select e.extname, n.nspname from pg_catalog.pg_extension e
             join pg_catalog.pg_namespace n on n.oid = e.extnamespace
            where e.extname <> 'plpgsql' order by e.extname loop
    s := s || public.sicherung_schema_sicher(format('create schema if not exists %I', r.nspname))
           || public.sicherung_schema_sicher(format('create extension if not exists %I with schema %I', r.extname, r.nspname));
  end loop;

  -- 2. Aufzählungstypen (zur Zeit keine)
  for r in select t.oid, t.typname from pg_catalog.pg_type t
             join pg_catalog.pg_namespace n on n.oid = t.typnamespace
            where n.nspname = 'public' and t.typtype = 'e' loop
    s := s || public.sicherung_schema_sicher(format('create type public.%I as enum (%s)', r.typname,
           (select string_agg(quote_literal(enumlabel), ', ' order by enumsortorder)
              from pg_catalog.pg_enum where enumtypid = r.oid)));
  end loop;

  -- 3. Zähler (Sequenzen), die nicht zu einer Identity-Spalte gehören
  s := s || E'\n-- Zähler\n';
  for r in select q.* from pg_catalog.pg_sequences q
            where q.schemaname = 'public'
              and not exists (select 1 from pg_catalog.pg_depend d
                               where d.objid = format('%I.%I', q.schemaname, q.sequencename)::regclass
                                 and d.deptype = 'i')
            order by q.sequencename loop
    s := s || format(E'create sequence if not exists public.%I as %s increment %s minvalue %s maxvalue %s start %s cache %s%s;\n',
           r.sequencename, r.data_type::text, r.increment_by, r.min_value, r.max_value, r.start_value, r.cache_size,
           case when r.cycle then ' cycle' else '' end);
  end loop;

  -- 4. Tabellen (ohne Vorgabewerte, die kommen nach den Funktionen)
  s := s || E'\n-- Tabellen\n';
  for r in select c.oid, c.relname from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname loop
    select string_agg(
             format('  %I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod))
             || case when a.attcollation <> 0 and a.attcollation <> ty.typcollation
                     then ' collate ' || (select format('%I.%I', cn.nspname, co.collname)
                                            from pg_catalog.pg_collation co
                                            join pg_catalog.pg_namespace cn on cn.oid = co.collnamespace
                                           where co.oid = a.attcollation) else '' end
             || case a.attidentity when 'a' then ' generated always as identity'
                                   when 'd' then ' generated by default as identity' else '' end
             || case when a.attnotnull then ' not null' else '' end,
             E',\n' order by a.attnum)
      into spalten
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_type ty on ty.oid = a.atttypid
     where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;
    s := s || format(E'create table if not exists public.%I (\n%s\n);\n', r.relname, coalesce(spalten, ''));
  end loop;

  -- Primär- und Eindeutigkeitsschlüssel gleich nach den Tabellen: Ansichten mit
  -- GROUP BY auf dem Schlüssel brauchen sie schon beim Anlegen.
  s := s || E'\n-- Primär- und Eindeutigkeitsschlüssel\n';
  for r in select c.relname, co.conname, pg_catalog.pg_get_constraintdef(co.oid) def
             from pg_catalog.pg_constraint co
             join pg_catalog.pg_class c on c.oid = co.conrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and co.contype in ('p', 'u')
            order by c.relname, case co.contype when 'p' then 0 else 1 end, co.conname loop
    s := s || public.sicherung_schema_sicher(format('alter table public.%I add constraint %I %s', r.relname, r.conname, r.def));
  end loop;

  -- 5. Funktionen und Ansichten. Funktionen, die eine Ansicht als Typ brauchen,
  --    kommen nach den Ansichten. Ansichten in der Reihenfolge ihrer Abhängigkeiten.
  select coalesce(array_agg(c.oid), '{}') into sichten
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v';

  s := s || E'\n-- Funktionen\n';
  for runde in 1..2 loop
    for r in select p.oid, pg_catalog.pg_get_functiondef(p.oid) def,
                    exists (select 1
                              from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[]) || p.prorettype) t(oid)
                              join pg_catalog.pg_type ty on ty.oid = t.oid
                              left join pg_catalog.pg_type el on el.oid = ty.typelem
                             where coalesce(nullif(ty.typrelid, 0), el.typrelid) = any (sichten)) braucht_sicht
               from pg_catalog.pg_proc p
               join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind in ('f', 'p')
                and not exists (select 1 from pg_catalog.pg_depend d
                                 where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
              order by p.proname, p.oid loop
      if (runde = 1 and not r.braucht_sicht) or (runde = 2 and r.braucht_sicht) then
        s := s || r.def || E';\n\n';
      end if;
    end loop;

    if runde = 1 then
      s := s || E'-- Ansichten\n';
      for i in 1..60 loop
        neu := false;
        for r in select c.oid, c.relname, c.reloptions from pg_catalog.pg_class c
                  where c.oid = any (sichten) and not (c.oid = any (fertig))
                    and not exists (
                      select 1 from pg_catalog.pg_rewrite rw
                        join pg_catalog.pg_depend d on d.classid = 'pg_catalog.pg_rewrite'::regclass and d.objid = rw.oid
                       where rw.ev_class = c.oid and d.refclassid = 'pg_catalog.pg_class'::regclass
                         and d.refobjid <> c.oid and d.refobjid = any (sichten) and not (d.refobjid = any (fertig)))
                  order by c.relname loop
          s := s || format(E'create or replace view public.%I%s as\n%s;\n\n', r.relname,
                 case when r.reloptions is null then '' else ' with (' || array_to_string(r.reloptions, ', ') || ')' end,
                 rtrim(rtrim(pg_catalog.pg_get_viewdef(r.oid, true)), ';'));
          fertig := fertig || r.oid;
          neu := true;
        end loop;
        exit when not neu;
      end loop;
      -- falls ein Kreis übrig bleibt: trotzdem hinschreiben
      for r in select c.oid, c.relname, c.reloptions from pg_catalog.pg_class c
                where c.oid = any (sichten) and not (c.oid = any (fertig)) loop
        s := s || format(E'create or replace view public.%I%s as\n%s;\n\n', r.relname,
               case when r.reloptions is null then '' else ' with (' || array_to_string(r.reloptions, ', ') || ')' end,
               rtrim(rtrim(pg_catalog.pg_get_viewdef(r.oid, true)), ';'));
      end loop;
    end if;
  end loop;

  -- 6. Vorgabewerte
  s := s || E'\n-- Vorgabewerte\n';
  for r in select c.relname, a.attname, pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) ausdruck
             from pg_catalog.pg_attrdef ad
             join pg_catalog.pg_class c on c.oid = ad.adrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             join pg_catalog.pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
            where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attgenerated = ''
            order by c.relname, a.attnum loop
    s := s || format(E'alter table public.%I alter column %I set default %s;\n', r.relname, r.attname, r.ausdruck);
  end loop;

  -- 7. Schlüssel und Prüfungen, dann Verzeichnisse (Indexe), Fremdschlüssel zuletzt
  s := s || E'\n-- Schlüssel und Prüfungen\n';
  for r in select c.relname, co.conname, pg_catalog.pg_get_constraintdef(co.oid) def
             from pg_catalog.pg_constraint co
             join pg_catalog.pg_class c on c.oid = co.conrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and co.contype in ('x', 'c')
            order by c.relname, co.conname loop
    s := s || public.sicherung_schema_sicher(format('alter table public.%I add constraint %I %s', r.relname, r.conname, r.def));
  end loop;

  s := s || E'\n-- Verzeichnisse\n';
  for r in select pg_catalog.pg_get_indexdef(i.indexrelid) def
             from pg_catalog.pg_index i
             join pg_catalog.pg_class c on c.oid = i.indrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p')
              and not exists (select 1 from pg_catalog.pg_constraint co where co.conindid = i.indexrelid and co.contype in ('p', 'u', 'x'))
            order by c.relname, i.indexrelid::regclass::text loop
    s := s || regexp_replace(r.def, '^CREATE (UNIQUE )?INDEX ', 'CREATE \1INDEX IF NOT EXISTS ') || E';\n';
  end loop;

  s := s || E'\n-- Fremdschlüssel\n';
  for r in select c.relname, co.conname, pg_catalog.pg_get_constraintdef(co.oid) def
             from pg_catalog.pg_constraint co
             join pg_catalog.pg_class c on c.oid = co.conrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and co.contype = 'f'
            order by c.relname, co.conname loop
    s := s || public.sicherung_schema_sicher(format('alter table public.%I add constraint %I %s', r.relname, r.conname, r.def));
  end loop;

  -- 8. Zähler an ihre Spalte binden
  for r in select sq.relname seq, tc.relname tab, a.attname
             from pg_catalog.pg_depend d
             join pg_catalog.pg_class sq on sq.oid = d.objid and sq.relkind = 'S'
             join pg_catalog.pg_namespace n on n.oid = sq.relnamespace
             join pg_catalog.pg_class tc on tc.oid = d.refobjid
             join pg_catalog.pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
            where n.nspname = 'public' and d.deptype = 'a' loop
    s := s || format(E'alter sequence public.%I owned by public.%I.%I;\n', r.seq, r.tab, r.attname);
  end loop;

  -- 9. Auslöser (auch auf auth.users und storage, wenn sie eine eigene Funktion rufen)
  s := s || E'\n-- Auslöser\n';
  for r in select n.nspname, pg_catalog.pg_get_triggerdef(t.oid) def
             from pg_catalog.pg_trigger t
             join pg_catalog.pg_class c on c.oid = t.tgrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             join pg_catalog.pg_proc p on p.oid = t.tgfoid
             join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
            where not t.tgisinternal and pn.nspname = 'public' and n.nspname in ('public', 'auth', 'storage')
            order by n.nspname, c.relname, t.tgname loop
    if r.nspname = 'public' then
      s := s || regexp_replace(r.def, '^CREATE (CONSTRAINT )?TRIGGER ', 'CREATE OR REPLACE \1TRIGGER ') || E';\n';
    else
      s := s || public.sicherung_schema_sicher(regexp_replace(r.def, '^CREATE (CONSTRAINT )?TRIGGER ', 'CREATE OR REPLACE \1TRIGGER '));
    end if;
  end loop;

  -- 10. Wer was sehen darf (Zeilenschutz und Regeln)
  s := s || E'\n-- Zeilenschutz\n';
  for r in select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity order by c.relname loop
    s := s || format(E'alter table public.%I enable row level security;\n', r.relname);
    if r.relforcerowsecurity then
      s := s || format(E'alter table public.%I force row level security;\n', r.relname);
    end if;
  end loop;

  s := s || E'\n-- Regeln\n';
  for r in select p.*,
                  format('create policy %I on %I.%I as %s for %s to %s%s%s', p.policyname, p.schemaname, p.tablename,
                         lower(p.permissive), lower(p.cmd),
                         (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(p.roles) x),
                         case when p.qual is null then '' else ' using (' || p.qual || ')' end,
                         case when p.with_check is null then '' else ' with check (' || p.with_check || ')' end) def
             from pg_catalog.pg_policies p
            where p.schemaname in ('public', 'storage')
            order by p.schemaname, p.tablename, p.policyname loop
    if r.schemaname = 'public' then
      s := s || format(E'drop policy if exists %I on public.%I;\n', r.policyname, r.tablename) || r.def || E';\n';
    else
      s := s || public.sicherung_schema_sicher(format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename))
             || public.sicherung_schema_sicher(r.def);
    end if;
  end loop;

  -- 11. Rechte an Tabellen, Ansichten, Zählern und Funktionen
  s := s || E'\n-- Rechte\n';
  for r in select c.oid, c.relname, c.relkind, c.relacl, c.relowner from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'S') order by c.relname loop
    s := s || format(E'revoke all on %s public.%I from public, anon, authenticated, service_role;\n',
           case when r.relkind = 'S' then 'sequence' else 'table' end, r.relname);
    s := s || coalesce((
      select string_agg(format(E'grant %s on %s public.%I to %s;\n', g.rechte,
                               case when r.relkind = 'S' then 'sequence' else 'table' end, r.relname, g.wer), '')
        from (select case when a.grantee = 0 then 'public' else quote_ident(ro.rolname) end wer,
                     string_agg(a.privilege_type, ', ' order by a.privilege_type) rechte
                from aclexplode(coalesce(r.relacl, acldefault(case when r.relkind = 'S' then 's' else 'r' end::"char", r.relowner))) a
                left join pg_catalog.pg_roles ro on ro.oid = a.grantee
               where a.grantee <> r.relowner
                 -- MAINTAIN gibt es erst ab Postgres 17, ein älterer Server kennt es nicht
                 and a.privilege_type <> 'MAINTAIN'
                 and (a.grantee = 0 or ro.rolname in ('anon', 'authenticated', 'service_role'))
               group by 1) g), '');
  end loop;

  for r in select p.oid, p.proacl, p.proowner from pg_catalog.pg_proc p
             join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind in ('f', 'p')
              and not exists (select 1 from pg_catalog.pg_depend d
                               where d.classid = 'pg_catalog.pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
            order by p.proname, p.oid loop
    s := s || format(E'revoke all on function %s from public, anon, authenticated, service_role;\n', r.oid::regprocedure::text);
    s := s || coalesce((
      select string_agg(format(E'grant execute on function %s to %s;\n', r.oid::regprocedure::text,
                               case when a.grantee = 0 then 'public' else quote_ident(ro.rolname) end), '')
        from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a
        left join pg_catalog.pg_roles ro on ro.oid = a.grantee
       where a.grantee <> r.proowner and a.privilege_type = 'EXECUTE'
         and (a.grantee = 0 or ro.rolname in ('anon', 'authenticated', 'service_role'))), '');
  end loop;

  -- 12. Ablagen (Buckets)
  s := s || E'\n-- Ablagen\n';
  for r in select * from storage.buckets order by id loop
    s := s || public.sicherung_schema_sicher(format(
      'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %s) on conflict (id) do nothing',
      r.id, r.name, r.public, coalesce(r.file_size_limit::text, 'null'),
      coalesce(quote_literal(r.allowed_mime_types::text) || '::text[]', 'null')));
  end loop;

  -- 13. Realtime: welche Tabellen Änderungen melden
  s := s || E'\n-- Realtime\n';
  for r in select c.relname from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relreplident = 'f' order by c.relname loop
    s := s || format(E'alter table public.%I replica identity full;\n', r.relname);
  end loop;
  s := s || public.sicherung_schema_sicher('create publication supabase_realtime');
  for r in select tablename from pg_catalog.pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' order by tablename loop
    s := s || public.sicherung_schema_sicher(format('alter publication supabase_realtime add table public.%I', r.tablename));
  end loop;

  s := s || E'\nnotify pgrst, ''reload schema'';\n';
  return s;
end;
$$;

revoke all on function public.sicherung_schema() from public, anon;
grant execute on function public.sicherung_schema() to authenticated, service_role;
revoke all on function public.sicherung_schema_sicher(text) from public, anon;
grant execute on function public.sicherung_schema_sicher(text) to authenticated, service_role;

-- Einmalige Schlüssel für die Server-Funktion schema-holen (Plan B:
-- Bauplan ohne Anmeldung holen). Für niemanden lesbar, eine Stunde gültig.
create table if not exists public.sicherung_schema_abruf (
  schluessel text primary key,
  gueltig_bis timestamptz not null default now() + interval '1 hour'
);
alter table public.sicherung_schema_abruf enable row level security;
revoke all on public.sicherung_schema_abruf from anon, authenticated;

notify pgrst, 'reload schema';

-- Probe: zeigt ok, wenn der Bauplan geschrieben werden kann
select case when exists (select 1 from pg_proc where proname = 'sicherung_schema')
            then 'ok' else 'FEHLT' end as probe;
