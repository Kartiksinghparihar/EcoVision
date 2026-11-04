-- EcoVision database schema (PostgreSQL / Supabase)
-- Run in the Supabase SQL editor. Backend writes with the service role; dashboard users read via RLS.

create extension if not exists "pgcrypto";

-- Users / profiles -----------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  organisation text,
  created_at timestamptz not null default now()
);
create type public.app_role as enum ('admin', 'researcher', 'viewer');
create table public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

-- Species ---------------------------------------------------------------------
create table public.species (
  id text primary key,
  common_name text not null,
  scientific_name text not null,
  is_priority boolean not null default false
);
insert into public.species values
 ('tiger','Bengal Tiger','Panthera tigris tigris',true),
 ('leopard','Indian Leopard','Panthera pardus fusca',true),
 ('dhole','Dhole','Cuon alpinus',true),
 ('sambar','Sambar Deer','Rusa unicolor',false),
 ('spotted_deer','Spotted Deer','Axis axis',false),
 ('wild_boar','Wild Boar','Sus scrofa',false),
 ('langur','Gray Langur','Semnopithecus entellus',false),
 ('gaur','Gaur','Bos gaurus',false),
 ('unknown','Unclassified','—',false);

-- Camera traps ------------------------------------------------------------------
create table public.camera_traps (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  timezone text not null default 'Asia/Kolkata',
  firmware text,
  stream_url text,             -- authenticated streaming endpoint (not exposed to anon)
  installed_at timestamptz default now(),
  active boolean not null default true
);

create table public.camera_status (
  id bigserial primary key,
  camera_id uuid not null references public.camera_traps(id) on delete cascade,
  state text not null check (state in ('offline','idle','recording','live')),
  battery int, signal int, storage_pct numeric, buffered_events int default 0,
  reported_at timestamptz not null default now()
);
create index on public.camera_status (camera_id, reported_at desc);

create view public.camera_traps_with_status with (security_invoker = on) as
select c.*, s.state, s.battery, s.signal, s.storage_pct, s.reported_at as last_seen
from public.camera_traps c
left join lateral (select * from public.camera_status cs where cs.camera_id = c.id order by reported_at desc limit 1) s on true;

-- Recordings ---------------------------------------------------------------------
create table public.recordings (
  id text primary key,                      -- clip id generated on device
  camera_id uuid not null references public.camera_traps(id) on delete cascade,
  started_at timestamptz not null,
  duration_s numeric,
  storage_path text,                         -- Supabase Storage key when uploaded
  thumbnail_path text,
  trigger text check (trigger in ('pir','manual','schedule'))
);
create index on public.recordings (camera_id, started_at desc);

-- Detections ---------------------------------------------------------------------
create table public.detections (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.camera_traps(id) on delete cascade,
  species_id text not null references public.species(id),
  recording_id text references public.recordings(id) on delete set null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  detected_at timestamptz not null,
  temperature numeric(4,1), humidity numeric(4,1),
  motion_detected boolean default true,
  bbox jsonb,
  status text not null default 'confirmed' check (status in ('confirmed','pending','low_confidence','rejected')),
  created_at timestamptz not null default now(),
  unique (camera_id, detected_at, species_id)  -- idempotent offline re-sync
);
create index on public.detections (detected_at desc);
create index on public.detections (species_id, detected_at desc);
create index on public.detections (camera_id, detected_at desc);

-- Environmental readings -------------------------------------------------------------
create table public.sensor_readings (
  id bigserial primary key,
  camera_id uuid not null references public.camera_traps(id) on delete cascade,
  recorded_at timestamptz not null,
  temperature numeric(4,1), humidity numeric(4,1),   -- null = DHT11 read failure
  motion_detected boolean default false
);
create index on public.sensor_readings (camera_id, recorded_at desc);

-- Alerts -------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid references public.camera_traps(id) on delete cascade,
  type text not null,
  severity text not null check (severity in ('info','low','medium','high','critical')),
  title text not null, message text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.alerts (created_at desc);

-- Grants + RLS -------------------------------------------------------------------
grant select on public.species, public.camera_traps, public.camera_status, public.recordings,
  public.detections, public.sensor_readings, public.alerts, public.camera_traps_with_status to authenticated;
grant update (read) on public.alerts to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','species','camera_traps','camera_status','recordings','detections','sensor_readings','alerts'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy "read species" on public.species for select to authenticated using (true);
create policy "read cameras" on public.camera_traps for select to authenticated using (true);
create policy "read status" on public.camera_status for select to authenticated using (true);
create policy "read recordings" on public.recordings for select to authenticated using (true);
create policy "read detections" on public.detections for select to authenticated using (true);
create policy "read sensors" on public.sensor_readings for select to authenticated using (true);
create policy "read alerts" on public.alerts for select to authenticated using (true);
create policy "researchers mark alerts" on public.alerts for update to authenticated
  using (public.has_role(auth.uid(),'researcher') or public.has_role(auth.uid(),'admin'));
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- Analytics helper ---------------------------------------------------------------
create or replace function public.detection_summary(days int default 30)
returns table(species_id text, detections bigint, avg_confidence numeric)
language sql stable security invoker as $$
  select species_id, count(*), round(avg(confidence),3)
  from public.detections where detected_at > now() - make_interval(days => days)
  group by species_id order by 2 desc
$$;
