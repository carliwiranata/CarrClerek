-- CashViewer: lokasi user + pembatasan radius 100 km
-- Jalankan SEKALI di Supabase SQL Editor.
alter table public.profiles
  add column if not exists location_name text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision;

alter table public.profiles
  drop constraint if exists profiles_location_latitude_range;

alter table public.profiles
  add constraint profiles_location_latitude_range
  check (location_latitude is null or (location_latitude between -90 and 90));

alter table public.profiles
  drop constraint if exists profiles_location_longitude_range;

alter table public.profiles
  add constraint profiles_location_longitude_range
  check (location_longitude is null or (location_longitude between -180 and 180));
