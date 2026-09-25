-- Akun admin sungguhan.
--
-- Admin adalah pengguna Supabase Auth (email + kata sandi) yang user_id-nya
-- tercatat di tabel `admins`. Tabel ini TIDAK bisa diisi dari aplikasi —
-- hanya dari Supabase Dashboard (SQL Editor / service role). Aplikasi hanya
-- bisa bertanya "apakah saya admin?" lewat saya_admin().
--
-- Jalankan SETELAH 20260926_facilities.sql. Aman diulang.
--
-- Membuat akun admin (sekali per admin):
--   1. Dashboard → Authentication → Users → Add user → isi email & kata sandi,
--      centang "Auto Confirm User".
--   2. SQL Editor:
--        insert into public.admins (user_id)
--        select id from auth.users where email = 'admin@contoh.id'
--        on conflict do nothing;
--   Masuk di  https://<domain>/app/#/masuk/admin

create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Admin hanya dapat melihat barisnya sendiri. Tidak ada kebijakan
-- INSERT/UPDATE/DELETE: klien tidak bisa menjadikan dirinya admin.
drop policy if exists admins_select_own on public.admins;
create policy admins_select_own on public.admins
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.saya_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

revoke all on function public.saya_admin() from public, anon;
grant execute on function public.saya_admin() to authenticated;

-- Unit faskes kini hanya dapat dibuat dan dikelola oleh admin terdaftar.
-- (Sebelumnya siapa pun yang masuk bisa membuat unit untuk dirinya.)
drop policy if exists facilities_own on public.facilities;
create policy facilities_own on public.facilities
  for all to authenticated
  using (admin_id = auth.uid() and public.saya_admin())
  with check (admin_id = auth.uid() and public.saya_admin());

notify pgrst, 'reload schema';
