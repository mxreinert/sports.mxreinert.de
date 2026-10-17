-- Verbindungen zu Hevy und Strava. Schlüssel/Token liegen hier nur VERSCHLÜSSELT (AES-256-GCM, Schlüssel in Netlify).
-- Gleiche Absicherung wie alle Tabellen: nur eigene Zeilen, nur mit 2FA.
-- Einmal im Supabase SQL-Editor ausführen.

create table if not exists public.integrations (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  k          text        not null,
  data       jsonb       not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, k)
);

alter table public.integrations enable row level security;

drop policy if exists own_rows_2fa on public.integrations;
create policy own_rows_2fa on public.integrations for all to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2')
  with check (user_id = (select auth.uid()) and (select auth.jwt() ->> 'aal') = 'aal2');

revoke all on public.integrations from anon, public;
grant select, insert, update, delete on public.integrations to authenticated;

drop trigger if exists touch_updated_at on public.integrations;
create trigger touch_updated_at before update on public.integrations for each row execute function public.touch_updated_at();
