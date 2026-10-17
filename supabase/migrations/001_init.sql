-- mx sports – Grundschema (einmal im Supabase SQL-Editor ausführen).
--
-- Jede App-Tabelle speichert Datensätze als JSON (data) unter einem Schlüssel (k), genau wie im Browser-Speicher.
-- So bleibt die App ohne Schema-Änderungen erweiterbar, und Export/Import funktioniert 1:1.
--
-- Sicherheit (Row Level Security):
--   • Zugriff nur für angemeldete Nutzer und nur auf eigene Zeilen (user_id = auth.uid()).
--   • Zusätzlich Pflicht zur Zwei-Faktor-Anmeldung (aal2) – ohne 2FA-Code sind alle Tabellen leer/gesperrt.
--   • Die Rolle "anon" (nicht angemeldet) hat überhaupt keine Rechte.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
  -- muss zu src/js/store/schema.js passen
  tables text[] := array[
    'daily_log', 'workouts', 'runs', 'coach_targets', 'ring_settings', 'muscle_targets',
    'week_exceptions', 'phases', 'exercise_mapping', 'hevy_templates', 'kv'
  ];
  rule text := $r$user_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2'$r$;
begin
  foreach t in array tables loop
    execute format($f$
      create table if not exists public.%I (
        user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
        k          text        not null,
        data       jsonb       not null check (jsonb_typeof(data) = 'object'),
        updated_at timestamptz not null default now(),
        primary key (user_id, k)
      )$f$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows_2fa on public.%I', t);
    execute format('create policy own_rows_2fa on public.%I for all to authenticated using (%s) with check (%s)', t, rule, rule);

    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;
