-- Semua pasien otomatis terlihat dan dikelola admin (tanpa kode unit).
--
-- Setiap pasien yang masuk ke aplikasi mendaftarkan dirinya sendiri ke tabel
-- `patients` (dilakukan otomatis oleh aplikasi). Admin terdaftar (tabel
-- `admins`, lihat 20260927_admins.sql) boleh MEMBACA semua pasien dan semua
-- hasil ukur TeleBand. Pasien biasa tetap hanya melihat datanya sendiri.
--
-- Jalankan SETELAH 20260927_admins.sql. Aman diulang.
-- (20260926_facilities.sql tetap boleh ada; fitur unit disembunyikan di aplikasi.)

create table if not exists public.patients (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  email      text check (email is null or char_length(email) <= 120),
  anonymous  boolean not null default false,   -- sesi tanpa akun Google/email
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create index if not exists patients_last_seen on public.patients (last_seen desc);

alter table public.patients enable row level security;

-- Pasien membaca barisnya sendiri; admin membaca semuanya.
drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients
  for select to authenticated
  using (user_id = auth.uid() or public.saya_admin());

-- Pasien mendaftarkan & memperbarui barisnya sendiri. Akun admin tidak
-- didaftarkan sebagai pasien.
drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own on public.patients
  for insert to authenticated
  with check (user_id = auth.uid() and not public.saya_admin());

drop policy if exists patients_update_own on public.patients;
create policy patients_update_own on public.patients
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Admin membaca SEMUA hasil ukur TeleBand.
drop policy if exists device_readings_select_admin on public.device_readings;
create policy device_readings_select_admin on public.device_readings
  for select to authenticated
  using (public.saya_admin());

notify pgrst, 'reload schema';
