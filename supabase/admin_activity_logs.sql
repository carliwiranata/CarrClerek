-- CarrClerek: Admin role + activity log
-- Jalankan satu kali di Supabase SQL Editor.
-- Mengangkat akun yang sudah terdaftar menjadi admin.
-- Tidak mengubah password, status aktif, masa aktif, atau data toko.

begin;

update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('carliwiranata12@gmail.com');

-- Simpan login dan pembukaan fitur dengan waktu server (UTC).
create table if not exists public.user_activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('login', 'feature')),
  feature_name text,
  store_code text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint user_activity_feature_name_check
    check (
      (event_type = 'login' and feature_name is null)
      or
      (event_type = 'feature' and feature_name is not null)
    )
);

create index if not exists user_activity_logs_user_time_idx
  on public.user_activity_logs (user_id, occurred_at desc);

create index if not exists user_activity_logs_type_time_idx
  on public.user_activity_logs (event_type, occurred_at desc);

alter table public.user_activity_logs enable row level security;

drop policy if exists "Users can insert own activity logs" on public.user_activity_logs;
create policy "Users can insert own activity logs"
  on public.user_activity_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Admins can read all activity logs" on public.user_activity_logs;
create policy "Admins can read all activity logs"
  on public.user_activity_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles admin_profile
      where admin_profile.id = auth.uid()
        and lower(coalesce(admin_profile.role, '')) = 'admin'
        and coalesce(admin_profile.is_active, true) = true
        and (
          admin_profile.expires_at is null
          or admin_profile.expires_at > now()
        )
    )
  );

grant insert on public.user_activity_logs to authenticated;
grant select on public.user_activity_logs to authenticated;
grant usage, select on sequence public.user_activity_logs_id_seq to authenticated;

commit;

-- Verifikasi hasil: harus muncul satu baris akun admin jika email ditemukan.
select u.email, p.role, p.is_active, p.expires_at
from auth.users u
join public.profiles p on p.id = u.id
where lower(u.email) = lower('carliwiranata12@gmail.com');
