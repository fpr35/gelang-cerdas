-- Data pasien yang terlihat admin + penghapusan oleh admin.
--
-- Sebelumnya profil, tujuan kesehatan, target gizi, dan sesi makan hanya ada
-- di localStorage ponsel pasien. Kini aplikasi pasien menyalinnya otomatis ke:
--   - patients.profile        (jenis kelamin, usia, tinggi, berat, aktivitas,
--                              tujuan, target gizi)
--   - patients.sesi_berjalan  (sesi makan yang sedang berjalan, atau null)
--   - patient_meals           (riwayat sesi makan, tanpa foto)
-- Admin (saya_admin()) boleh membaca semuanya dan menghapus seluruh data
-- seorang pasien lewat hapus_data_pasien().
--
-- Jalankan SETELAH 20260928_patients.sql. Aman diulang.

alter table public.patients add column if not exists profile jsonb;
alter table public.patients add column if not exists sesi_berjalan jsonb;

alter table public.patients drop constraint if exists patients_profile_ukuran;
alter table public.patients add constraint patients_profile_ukuran
  check (profile is null or pg_column_size(profile) < 8000);
alter table public.patients drop constraint if exists patients_sesi_ukuran;
alter table public.patients add constraint patients_sesi_ukuran
  check (sesi_berjalan is null or pg_column_size(sesi_berjalan) < 20000);

create table if not exists public.patient_meals (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null check (char_length(id) between 1 and 60),
  at         timestamptz not null,
  data       jsonb not null check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists patient_meals_user_at on public.patient_meals (user_id, at desc);

alter table public.patient_meals enable row level security;

drop policy if exists patient_meals_select on public.patient_meals;
create policy patient_meals_select on public.patient_meals
  for select to authenticated
  using (user_id = auth.uid() or public.saya_admin());

drop policy if exists patient_meals_insert_own on public.patient_meals;
create policy patient_meals_insert_own on public.patient_meals
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists patient_meals_update_own on public.patient_meals;
create policy patient_meals_update_own on public.patient_meals
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists patient_meals_delete on public.patient_meals;
create policy patient_meals_delete on public.patient_meals
  for delete to authenticated
  using (user_id = auth.uid() or public.saya_admin());

/* ---------------- admin menghapus data seorang pasien ---------------- */
-- Menghapus profil, sesi makan, dan hasil ukur TeleBand pasien dari server.
-- Akun login-nya (auth.users) tidak ikut terhapus — itu hanya bisa dari
-- Dashboard. Bila pasien membuka aplikasi lagi, ia terdaftar ulang tanpa
-- data lama di server.
create or replace function public.hapus_data_pasien(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.saya_admin() then
    raise exception 'Hanya admin yang boleh menghapus data pasien.' using errcode = '42501';
  end if;
  delete from device_readings where user_id = target;
  delete from patient_meals   where user_id = target;
  delete from patients        where user_id = target;
end;
$$;

revoke all on function public.hapus_data_pasien(uuid) from public, anon;
grant execute on function public.hapus_data_pasien(uuid) to authenticated;

notify pgrst, 'reload schema';
