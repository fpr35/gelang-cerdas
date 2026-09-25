-- Hasil pengukuran diskrit dari TeleBand (paket HASIL, protokol BLE v1).
--
-- Satu baris = satu sesi ukur (tempel jari -> stop), bukan deret waktu.
-- Angka LIVE selama mengukur hanya pratinjau dan tidak disimpan.
--
-- Jalankan sekali di Supabase Dashboard -> SQL Editor. Aman diulang.

create table if not exists public.device_readings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Identitas unit: MAC/serial 6 byte dari paket INFO, dalam hex (12 karakter).
  device_serial    text not null check (device_serial ~ '^[0-9A-F]{12}$'),
  device_unit      smallint,                       -- nomor unit 1-99, null bila belum diatur
  firmware         text,

  -- `id` dari alat BUKAN kunci unik global: u16 yang kembali ke 1 setelah
  -- 65535 dan setelah NVS alat dihapus. Maka dedup memakai gabungan
  -- serial + id + epoch mulai ukur.
  device_result_id integer not null check (device_result_id between 0 and 65535),
  device_epoch     bigint  not null check (device_epoch >= 0),   -- 0 = jam alat belum tersetel

  measured_at      timestamptz,                    -- null bila stempel waktu alat tidak valid
  time_valid       boolean not null default false,
  duration_s       integer check (duration_s between 0 and 65535),

  -- null = tidak terukur (alat mengirim 0 + bit flag mati).
  -- Batas sengaja hanya rentang tipe byte, bukan rentang fisiologis: baris
  -- yang ditolak server tidak pernah di-HAPUS dari alat dan akan dikirim
  -- ulang terus. Menyaring angka janggal adalah tugas tampilan.
  bpm              smallint check (bpm between 1 and 255),
  spo2             smallint check (spo2 between 1 and 255),
  -- Estimasi EKSPERIMENTAL menurut firmware sendiri; bukan angka medis.
  glucose_est      integer  check (glucose_est between 1 and 65535),
  sys_est          smallint check (sys_est between 1 and 255),
  dia_est          smallint check (dia_est between 1 and 255),

  source           text not null check (source in ('tombol', 'web')),
  flags            smallint not null check (flags between 0 and 255),
  received_at      timestamptz not null default now(),

  unique (user_id, device_serial, device_result_id, device_epoch)
);

create index if not exists device_readings_user_time
  on public.device_readings (user_id, measured_at desc nulls last, received_at desc);

alter table public.device_readings enable row level security;

-- Pemilik: menulis dan membaca hasilnya sendiri. Tidak ada UPDATE/DELETE
-- dari klien — hasil ukur tidak boleh berubah diam-diam setelah tersimpan.
drop policy if exists device_readings_insert_own on public.device_readings;
create policy device_readings_insert_own on public.device_readings
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists device_readings_select_own on public.device_readings;
create policy device_readings_select_own on public.device_readings
  for select to authenticated
  using (user_id = auth.uid());

-- Lawan bicara dalam konsultasi (mis. dokter) boleh MEMBACA hasil pasien.
-- Ini mengikuti model kepercayaan yang sudah ada: siapa pun yang menjadi
-- anggota percakapan yang sama. Fungsi security definer dipakai supaya
-- pemeriksaan tidak terhalang RLS tabel consult_members; salah satu sisinya
-- selalu auth.uid(), jadi fungsi ini tidak bisa dipakai untuk menyelidiki
-- hubungan antara dua pengguna lain.
create or replace function public.sekonsultasi_dengan(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from consult_members m1
    join consult_members m2 on m2.consult_id = m1.consult_id
    where m1.user_id = auth.uid() and m2.user_id = target
  );
$$;

revoke all on function public.sekonsultasi_dengan(uuid) from public;
grant execute on function public.sekonsultasi_dengan(uuid) to authenticated;

drop policy if exists device_readings_select_consult on public.device_readings;
create policy device_readings_select_consult on public.device_readings
  for select to authenticated
  using (public.sekonsultasi_dengan(user_id));

notify pgrst, 'reload schema';
