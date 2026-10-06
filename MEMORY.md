# MEMORY — Catatan Progres TeleCare

Berkas ini melacak **keadaan proyek, keputusan yang sudah diambil, dan apa yang belum
selesai** — supaya siapa pun (termasuk sesi kerja berikutnya) bisa melanjutkan tanpa
menebak-nebak. Untuk cara memakai dan menjalankan proyek, lihat [README.md](README.md);
berkas ini khusus soal *progres* dan *alasan di balik keputusan*.

**Diperbarui:** 5 Oktober 2026

---

## 1. Ringkasan

| | |
| --- | --- |
| **Judul penelitian** | TeleCare: Platform Telemedisin AIoT Terpadu untuk Pencegahan Penyakit Kronis dan Manajemen Gaya Hidup Berbasis Health 5.0 |
| **Komisaris pembimbing** | Dr. Fuad Anwar, S.Si., M.Si. |
| **Tim** | Fajar Jelang Riyadi (M0222027) · Faizal Tri Widiandika (M0222026) · Sholeh Putra Utama (M0222083) — Fisika, FMIPA |
| **Teknologi** | HTML, CSS, JavaScript **native** — tanpa framework, tanpa build step |
| **Hosting** | **Firebase Hosting** (statis, dari akar repo; `firebase deploy`) |
| **Backend** | **Firebase paket Spark (gratis)** — Auth, Cloud Firestore, AI Logic (Gemini Developer API) |
| **Batasan** | **Tidak boleh paket Blaze** (keputusan Team Lead, 5 Okt 2026): tanpa Cloud Functions, tanpa push server |
| **Versi kontrol** | Git, branch `main` → https://github.com/fpr35/gelang-cerdas |

Perjalanan backend: Firebase lama `telecare-id` (s.d. 21 Sep 2026) → Vercel + Supabase +
metered.ca (21 Sep – 5 Okt) → **Firebase project baru** (sejak 5 Okt, butir #42). Data era
Supabase tidak dipindahkan — mulai dari nol. Langkah Console untuk pemilik project:
[PANDUAN-FIREBASE.md](PANDUAN-FIREBASE.md).

### Masuk

| Peran | Tautan |
| --- | --- |
| Pasien | `/app/` → Masuk dengan Google |
| Admin | `/app/#/masuk/admin` (akun email dibuat di Console + dokumen `admins/{uid}`) |

---

## 2. Status per bagian

Legenda: ✅ selesai & terverifikasi · 🟡 berjalan, ada batasan · ⬜ belum dikerjakan

### Situs penelitian (landing page)

| Bagian | Status | Catatan |
| --- | --- | --- |
| Hero + Three.js "data sphere" | ✅ | Shader kustom, 1.400 partikel, pita EKG 3D |
| Urgensi / latar belakang | ✅ | Angka bersumber Riskesdas 2018 + WHO, ada daftar sitasi |
| Perangkat + viewer GLB Three.js | ✅ | Auto-fit kamera, fallback geometris bila GLB gagal |
| Perbandingan TeleBand vs TeleRing | ✅ | Render Blender + halo SVG |
| Diagram arsitektur, Health 5.0, roadmap, tim | ✅ | |
| Dashboard pratinjau | 🟡 | Simulasi lokal berlabel "SIMULASI LOKAL" (sumber RTDB lama dicabut 5 Okt) |
| 404, robots.txt, sitemap.xml, OG | ✅ | |

### Aplikasi (`/app/`)

| Bagian | Status | Catatan |
| --- | --- | --- |
| Masuk dengan Google (pasien) | ✅ | Firebase Auth, popup (cadangan: pengalihan). Diuji di emulator |
| Masuk admin (email + sandi) | ✅ | Firebase Auth + dokumen `admins/{uid}` |
| Profil, makanan, hasil ukur lintas perangkat | ✅ | Firestore, sinkron dua arah, data per akun (#41, #42). E2E emulator 41/41 |
| Aturan keamanan Firestore | ✅ | `firestore.rules`, 54 kasus uji emulator |
| **TeleBand fisik (protokol BLE tim)** | ✅ | Terkonfirmasi dengan alat fisik (25 Sep, era Vercel); jalur simpan kini Firestore — **uji ulang dengan alat fisik setelah deploy** |
| Deteksi makanan & Wawasan AI | 🟡 | Firebase AI Logic; logika diuji dengan model tiruan (20/20), **belum dicoba ke Gemini sungguhan** |
| Riwayat makanan + gizi per tujuan, analisis | ✅ | |
| Dasbor admin (semua pasien) | ✅ | Diuji E2E: daftar, detail, hapus data |
| Vital + EKG | 🟡 | Vital dari TeleBand; kartu EKG kosong (alat belum punya EKG) |
| PWA | ✅ | service worker `v40-firebase` |
| Notifikasi | 🟡 | Hanya lokal; push server tidak ada (butuh Blaze) |
| Konsultasi/chat/panggilan, dokter, unit | ⬜ | Tersembunyi; kodenya masih era Supabase — perlu diport sebelum dinyalakan |
| **Project Firebase sungguhan** | 🟡 | Project `app-telecare` dibuat; config & `.firebaserc` terisi (5 Okt). Menunggu `firebase deploy` + uji Bagian 8 panduan |

---

## 3. Riwayat pengerjaan

Urut dari yang paling awal. Butir 1–16 terjadi di era Firebase.

1. **Situs penelitian + aset 3D.** Landing page dengan palet Kemenkes RI; aset produk
   prosedural lewat [blender/build_assets.py](blender/build_assets.py).
2. **Perbaikan render bertahap.** Empat iterasi sampai bentuknya benar.
3. **Lapisan futuristik.** Transisi antar-seksi, HUD, ikon SVG teranimasi, holo Three.js.
4. **Deploy pertama** ke Firebase Hosting.
5. **Poles + SEO.** Perbandingan perangkat, kartu sosial, WebP (± 95% lebih ringan), 404, sitemap.
6. **Aplikasi TeleCare.** SPA native: pairing, sinkronisasi, sesi makan, analisis + telemedisin.
7. **Chat nyata + panggilan nyata** (Firebase RTDB + WebRTC).
8. **Login Google, tamu, dan 4 peran.**
9. **Git + angka Urgensi bersumber.**
10. **Pengetatan keamanan database** (aturan RTDB per peserta, ID konsultasi kriptografis).
11. **PWA, TURN, GATT, detail pasien, notifikasi eskalasi.**
12. **Dering panggilan masuk** (`duty`/`inbox`, `ring.js` + `ring-ui.js`).
13. **Audit "dummy" menyeluruh** — sembilan perbaikan kejujuran data.
14. **Kalibrasi sensor untuk pengembang** (`#/sistem/kalibrasi`).
15. **Dua video showcase** + draft CapCut.
16. **Repositori dipublikasikan** (awalnya https://github.com/Mostoples/telecare).
17. **Migrasi ke Supabase + Vercel + metered.ca** (21 Sep 2026, commit `ff79906`).
    `app/js/supabase.js` menggantikan `firebase.js` dengan nama API yang sama
    (`TC.FB`/`TC.Chat`/`TC.RTC`). Sinyal WebRTC pindah ke Realtime Broadcast, kehadiran ke
    Realtime Presence, chat ke tabel Postgres. Hosting pindah ke Vercel. Repo kini
    https://github.com/fpr35/gelang-cerdas.
18. **Web Push standar** menggantikan FCM: langganan ke `push_subscriptions`, dikirim Edge
    Function `send-push` lewat Database Webhook.
19. **Dering versi Supabase** (22 Sep): `doctor_directory` agar dokter yang sedang tidak online tetap
    dapat dipanggil (dan menerima push); status jaga lewat Presence `duty:{doctorId}`;
    kotak masuk di tabel `inbox`.
20. **Perbaikan panggilan & chat** (23 Sep): penentuan pengirim offer lewat Presence (ID lebih kecil),
    event `bye`, `Consult.syncFromServer()` saat boot, dan `Consult.start()` memakai ulang
    percakapan aktif dengan dokter yang sama.
21. **Pesan kartu & percakapan contoh** (25 Sep): lihat §5 — dua bug dari migrasi diperbaiki,
    README dan berkas ini ditulis ulang untuk arsitektur baru.
22. **Integrasi TeleBand fisik, tahap 1** (25 Sep). Berdasarkan dokumen konteks tim dan repo
    firmware `D:\Data_C_Fito\joki\TeleCare` (`docs/PROTOKOL_BLE.md`, `tc_proto.h`,
    `tools/web-test/index.html`). Modul protokol baru `teleband-ble.js` (ble.js tidak disentuh),
    `TeleBandLink` + `Readings` di engine.js, layar `#/teleband`, tabel `device_readings`,
    Vitals per metrik, label asal per kartu vital. Keputusan 4A–4D di §4.
23. **TeleBand teruji dengan alat fisik** (25 Sep). Gejala awal: alat "terhubung" tetapi beranda
    tetap dummy. Dua sebab ditutup: (1) TeleBand bisa dipilih lewat pemindaian BLE *generik*
    (`ble.js`, `acceptAllDevices`) — tampak tersambung tanpa pernah mengirim angka; kini ditolak dan
    diarahkan ke `#/teleband`. (2) Hasil yang baru selesai (≤ 10 menit) ikut mengisi Vitals,
    untuk pengukuran yang selesai sebelum LIVE stabil. Di sisi alat, teknisi memperbarui
    `tc_ble.cpp` (protokol tidak berubah): diagnosa GAP di Serial, dan bond basi dihapus otomatis
    saat enkripsi gagal — pairing lama di HP yang sudah "dilupakan" sebelumnya menggagalkan sambungan.
24. **Penyederhanaan tampilan** (25 Sep, permintaan user). Sakelar `TC.FITUR` (core.js):
    `daftarAkun` dan `konsultasi` = false — **disembunyikan, bukan dihapus**; rute dialihkan lewat
    `opts.fitur` di app.js, tab/sidebar disaring, dering dokter tidak didaftarkan. Halaman pindai
    hanya menyambung TeleBand. Stres dihapus dari landing page (gauge, kartu Urgensi, legenda tren,
    roadmap, segmen). Analisis pasien: kartu indeks stres, langkah, dan durasi tidur dihapus.
    `New folder/` (firmware dari teknisi) dan `*.zip` masuk `.gitignore`/`.vercelignore`.
    Sisa stres (Wawasan AI, detail pasien dokter) dirapikan di butir 25.
25. **Fokus TeleBand + perapian kartu** (25 Sep, permintaan user). Perangkat selain TeleBand
    (TeleRing, TeleStrap, TeleCuff, TeleScale, TelePatch) diberi `tersembunyi: true` di data.js;
    `D.DEVICE_TYPES` kini hanya yang tampil, katalog lengkap di `D.DEVICE_TYPES_SEMUA`,
    `D.jenisTampil(type)` menyaring perangkat lama di penyimpanan. Artikel a4 (TeleRing) ikut
    tersembunyi. Akun demo tak lagi memasang TeleRing. "Perangkat yang didukung" hanya TeleBand
    fisik. Wawasan AI beranda kini dari HR/SpO₂, kartu indeks stres + kolom CSV stres di detail
    pasien dihapus. Landing: tab TeleRing, bagian #banding dan #video (turntable memuat TeleRing)
    diberi `hidden`; kotak TeleRing di diagram arsitektur diganti "Aplikasi TeleCare · Web
    Bluetooth"; gambar hero memakai render-teleband. `css/style.css` perlu `[hidden]{display:none
    !important}` karena `.prod-tabs` memakai inline-flex.
    **Penyebab ruang kosong di kartu:** `.insight > *` / `.promo > *{position:relative}` menimpa
    `position:absolute` milik hiasan (glow/deco) sehingga hiasan memakan 170px — kini `:not()`.
    `.stat-row` dan `.vital-grid` (desktop) memakai `grid-auto-flow:column` agar kolom mengikuti
    jumlah kotak. `simulateScan` tak lagi memakai indeks tetap (akan error bila jenis tinggal satu).
    Belum disentuh: kartu EKG beranda demo (TeleBand simulasi punya cap `ecg`, alat fisik tidak).
    Landing, konsultasi: kotak "Teleconsult" di diagram arsitektur → "Tinjauan Nakes" (catatan
    klinis, eskalasi — fitur layar dokter yang memang ada); hero, bagian #aplikasi (tangkapan
    `app-konsultasi.webp` diberi `hidden`, butir "Konsultasi berkonteks" → "Tinjauan tenaga
    kesehatan"), Tahap 04 alur layanan, dan ticker (js/app.js) tak lagi menawarkan konsultasi.
    Sengaja dibiarkan: kalimat masalah di #urgensi ("konsultasi tidak selalu tersedia di lokasi").
    Panah diagram arsitektur dibuat ulang: semuanya lurus mendatar ke tepi kiri kotak tujuan
    (dulu sebagian berbelok dan berhenti di celah), plus panah Basis Data → Mesin Aturan Klinis.
    `#/mulai` (onboarding) kini punya tombol kembali ke landing (`href="../"`, kelas `.onb__top`).
26. **Data nyata saja** (25 Sep, permintaan user: "semua data dummy hilangkan"). Keputusan user:
    dokter–pasien dibuat asli; vital "—" bila TeleBand tak tersambung; sesi makan = input manual +
    glukosa TeleBand; tamu mulai kosong. Sakelar baru `TC.FITUR.simulasi=false` (semua jalur simulasi
    tetap ada di kode) dan `peranAdmin=false` (Admin Faskes/Platform disembunyikan: seluruhnya data
    contoh; akun lama berperan itu di-logout oleh `wrap()`).
    - Vitals: nilai awal null, `step()` tak membangkitkan apa pun, `hist` diisi `ingest()`, alat lepas
      → kembali null. `snapshot()` mengembalikan null per metrik; kartu suhu/EKG hilang.
    - Sesi makan `v: 2`: titik Sebelum makan (−30…+15 mnt), +1 jam (45…80), +2 jam (105…140) hanya
      diisi `Meals.isiGlukosa()` dari HASIL TeleBand (dipanggil `TeleBandLink.onHasil`, pakai waktu
      alat); jendela lewat → `terlewat`; delta hanya bila baseline + ≥1 titik sesudah; selain itu
      kategori "Data kurang". Foto hanya lampiran, tak ada pengenalan makanan acak.
    - Tren 7 hari & grafik detail vital dari `Readings` (`TC.trenDariHasil`, `TC.hasilLokal`).
      Riwayat: tab "Hasil Ukur" menggantikan "Sinkronisasi".
    - `bersihkanDataDummy()` (app.js, sekali, bendera `dataNyataV1`): buang perangkat non-TeleBand,
      buffer, sesi makan lama, dailyVitals, vitalsHistory, isian tamu.
    - Dokter–pasien: migrasi `supabase/migrations/20260926_care_links.sql` (care_invites, care_links,
      RPC `hubungkan_dokter`, policy `device_readings_select_doctor`). Klien `TC.CareDB`
      (supabase.js). Dokter: kartu Kode dokter + pasien dari server (`viewClinicNyata` dkk. di
      views-roles.js); pasien: Profil → Dokter saya (`/profil/dokter`). Tanpa migrasi, layar
      menampilkan petunjuk menjalankannya (dicek: server produksi belum punya tabelnya).
    - Tab bar pasien: Riwayat di kiri Profil. Aplikasi kini punya `[hidden]{display:none!important}`.
    - Landing: "Jadwalkan Demo" → "Buka Aplikasi"; Wi-Fi → Bluetooth (teks & ikon `i-bt`);
      tangkapan kedua `assets/img/app-pindai.png` (emulasi 390×844 lewat CDP, skrip scratch).
      Tangkapan lama `app-beranda.webp` masih berisi data contoh & tab Konsultasi.
    - Uji Node TeleBand kini 60/60 (asersi 4C lama diganti: suhu tetap null; + 5 uji sesi makan).
27. **Admin Faskes kembali, data asli** (25 Sep, permintaan user; Admin Platform tetap tersembunyi,
    `peranTersembunyi()` kini hanya 'admin'). Migrasi `supabase/migrations/20260926_facilities.sql`:
    `facilities` (satu unit per admin, kolom `code`), `facility_members` (role pasien|dokter, nama
    disalin), RPC `gabung_unit(kode, nama, peran)`, policy `device_readings_select_facility` (admin
    membaca hasil ukur anggota berperan pasien). Klien `TC.FacilityDB` + `ReadingsDB.daftarBanyak`.
    Layar `viewFacilityNyata` (buat unit bila belum ada, kode unit, triase dari hasil terakhir,
    grafik jumlah hasil 7 hari, laporan CSV), Anggota, Perangkat (inventaris dari `device_serial`
    hasil ukur), Nakes; detail anggota memakai `viewPatientDetailNyata` (mode FASKES: tanpa catatan
    klinis, tombol "Keluarkan dari unit"). Anggota/nakes bergabung di Profil → Unit saya
    (`/profil/unit`, pasien & dokter). Diuji dengan mock FacilityDB/ReadingsDB (tampilan benar);
    alur server belum teruji karena migrasi belum dijalankan.
28. **Capaian target gizi** (25 Sep, permintaan user: pasien tak tahu apakah target Tujuan
    Kesehatan tercapai). `Meals.progresTarget()` (engine.js): status per zat gizi — sisa (<90%),
    tercapai (90–110%), lebih (>110%). Kartu bersama `TC.views.kartuTarget()` di Beranda
    ("Ringkasan Hari Ini", + tautan Atur target) dan di atas Profil → Tujuan Kesehatan.
    Bug diperbaiki: `Meals.today()` dulu mengabaikan sesi yang masih berjalan (baru terhitung ±2 jam
    setelah makan).
29. **Target gizi dari profil** (25 Sep, permintaan user). `TC.Gizi` (engine.js): BMR Mifflin-St Jeor
    × faktor aktivitas (1,2/1,375/1,55/1,725) ± tujuan (turun −500, massa +300; lantai = max(BMR,
    1200 P/1500 L)); protein g/kg (jaga 0,8 · gula 1,0 · turun 1,2 · massa 1,6), lemak % energi
    (jaga 30 · gula 35 · lainnya 25), karbo = sisa; semua kombinasi uji berada dalam AMDR. Field profil
    baru `aktivitas` (Informasi Pribadi & Lengkapi Data) dan `targetManual` (target ketik sendiri tidak
    ditimpa; tombol "Hitung ulang dari profil"). Profil belum lengkap → paket D.GOALS + petunjuk.
    Target dihitung ulang saat boot, simpan profil, dan pilih tujuan. Halaman Tujuan menampilkan
    "Dasar perhitungan target" langkah demi langkah. Angka "tercapai" = jumlah gizi sesi makan hari
    ini dari tabel FOODS (bukan TeleBand). Uji Node gizi 24/24 (skrip scratch).
30. **Tujuan "Bulking"** (25 Sep, permintaan user): `bulking` di D.GOALS (cadangan 2700/355/130/75) dan
    `Gizi.TUJUAN` (+500 kkal, protein 1,8 g/kg, lemak 25%) — beda dari "Menambah massa otot" (+300,
    1,6 g/kg). Otomatis muncul di Profil → Tujuan dan Lengkapi Data. Uji gizi 29/29.
31. **Peran & login baru + Gemini** (25 Sep, permintaan lead engineer).
    - Peran kini hanya Pasien dan Admin (id tetap `admin-faskes`, nama tampil "Admin"). Sakelar baru:
      `peranDokter=false` (klinik, kode dokter, nakes unit, "Dokter saya"), `akunTamu=false`
      (tombol tamu & `?demo=`), `gantiPeran=false`. `sesiTidakSah()` di app.js mengeluarkan sesi
      dokter/tamu lama dan admin yang tidak masuk lewat /masuk/admin atau sesi Supabase-nya lain.
    - Admin sungguhan: Supabase Auth email+kata sandi + tabel `admins` (migrasi
      `20260927_admins.sql`, fungsi `saya_admin()`; policy facilities kini mensyaratkan admin).
      Masuk hanya di `/app/#/masuk/admin` (tanpa tautan dari mana pun), `FB.signInAdmin`. Akun admin
      dibuat di Dashboard (Add user) lalu `insert into admins`. Profil admin: hanya nama & kontak.
    - Deteksi makanan: Edge Function `supabase/functions/deteksi-makanan` (Gemini, secret
      `GEMINI_API_KEY`, opsional `GEMINI_MODEL`, bawaan gemini-2.5-flash); enum nama = D.FOODS,
      porsi dibulatkan ke 0,5–3. Klien `TC.DeteksiDB`; hasil = usulan di layar Pilih Makanan,
      gagal → manual. Foto diperkecil ≤768 px.
    - Belum teruji ke server: migrasi admins, fungsi Gemini (belum di-deploy). Form email/sandi
      pasien di /masuk hanya cocok untuk akun lokal lama — tanpa daftar & tamu, pasien praktis
      masuk lewat Google.
    - Pemisahan dua arah: halaman admin menolak non-admin (`signInAdmin`); halaman pasien menolak
      admin (`FB.cekAdmin()` di `adoptGoogleUser` + pemeriksaan sekali per uid di boot), karena
      Supabase menautkan identitas Google ke akun email yang sama.
    - Gemini 404 di produksi (model `gemini-2.5-flash` tidak tersedia lagi). Fungsi kini memilih model
      otomatis dari `GET /v1beta/models` (flash, generateContent, stabil dulu, versi tertinggi),
      mencoba ulang sekali bila 404, dan meneruskan pesan galat Google ke aplikasi. Perlu deploy ulang.
      Lalu 503 "high demand": fungsi kini mengulang model yang sama (jeda 1,5 dtk) lalu 2 model cadangan
      dari daftar (maks. 4 percobaan); tetap 503 → pesan "Gemini sedang sibuk" ke pengguna.
32. **Admin memantau SEMUA pasien** (25 Sep, permintaan user: tanpa kode unit). Sakelar `TC.FITUR.unit=false`
    (unit, kode unit, "Unit saya" disembunyikan). Migrasi `20260928_patients.sql`: tabel `patients`
    (pasien mendaftarkan diri otomatis via `PatientsDB.daftarkan`, sekali per uid per hari, dari
    FB.onStatus di app.js), policy `patients_select` (diri sendiri atau `saya_admin()`), dan
    `device_readings_select_admin`. Dasbor admin (views-roles 2N, `GLOBAL`/`L`): Ringkasan, Pengguna
    (cari nama/email), Perangkat, detail pengguna (tanpa tombol keluarkan), laporan CSV; hasil ukur
    lewat `ReadingsDB.terbaru(2000)`. Urutan migrasi: device_readings → facilities → admins → patients.
33. **Warna utama biru** (25 Sep, permintaan user). Token `--green-*` (app.css & style.css) kini berisi
    skala BIRU (nama dipertahankan); `--grad-primary` = #0B3A8C → #1E6FD9 → #3FB6F5 (tombol utama, FAB
    Catat, avatar, promo, logo, favicon, ikon PWA dibuat ulang via CDP). Hijau hanya untuk status positif
    lewat `--ok-*` (chip--g, dotlive, STATUS_META ok, batang/legenda Normal triase). Netral berhias hijau
    ikut dipetakan. Material GLB (TC_Strap/Accent/LED) diwarnai ulang di three-scenes.js. `#34A853` = logo
    Google (sengaja). Masih hijau: render statis render-teleband/hero-duo/og-cover & app-beranda.webp.
34. **Data pasien lengkap untuk admin + hapus** (25 Sep, permintaan user). Migrasi `20260929_data_pasien.sql`:
    `patients.profile`/`sesi_berjalan` (jsonb), tabel `patient_meals`, RPC `hapus_data_pasien(target)`
    (khusus admin; hapus readings, meals, patients — akun auth tetap). Pasien: `Store.onSave` (core.js) →
    `sinkronPasien` (app.js, jeda 4 dtk, tanda tangan per item di localStorage `telecare.sinkron.v1`, foto
    tidak dikirim). Admin: tombol hapus per baris di Pengguna + di detail; detail berisi "Sedang apa",
    profil & tujuan, capaian gizi hari ini (`Meals.progresTarget(meals, aktif, targets)`,
    `TC.views.kartuTarget(pr, {admin})`), riwayat sesi makan. Diuji via CDP (skrip scratch cdp-eval.js):
    kiriman profil/sesi benar, tanpa foto, tidak berulang; alur hapus lengkap. `--dump-dom` headless kini
    sering kosong (jaringan menggantung) — pakai CDP.
    Bug: `shortDate/hhmm/fullDate` (core.js) hanya menerima Date; eskalasi, catatan klinis, dan laporan
    CSV mengirim timestamp → detail pengguna ber-eskalasi gagal "d.getDate is not a function". Kini
    ketiganya menerima Date, angka, atau teks ISO (`keDate`).
35. **Tangkapan landing diperbarui** (25 Sep): `assets/img/app-beranda.png` (Beranda biru, data contoh:
    TeleBand tersambung, 1 sesi makan) menggantikan `app-beranda.webp` (file lama dibiarkan, tak dipakai).
    Teks "Pemantauan oleh admin unit" disesuaikan (tanpa kode unit).
36. **Render statis dibirukan** (25 Sep): render-teleband, render-hero-duo, og-cover (.png & .webp)
    diwarnai ulang per piksel (rona 70–200° → 216°, saturasi ×1,75+0,08, kecerahan tetap) lewat canvas
    di Edge/CDP (skrip scratch warnai.js). `/masuk/admin` kini punya tombol kembali ke landing (`../`).
    Pelajaran: di PowerShell 5.1 JANGAN `Get-Content | Set-Content -Encoding utf8` untuk file repo —
    membaca ANSI + menulis BOM merusak "—" (sw.js sempat rusak, dipulihkan dari git).
37. **UI/UX ala AQUENT dari template** (1 Okt, branch `ui-aquent`): rombakan neumorfik dari repo
    template (`template/telecare/web`, commit 6a60a78..HEAD) dibawa lewat merge 3 arah — basis 6a60a78
    identik dengan commit pertama repo ini. Ikut: `app/css/app.css`, `css/neu.css`, markup view, tema
    biru/hijau di Pengaturan, ikon & ilustrasi 3D (`assets/3d/`). Logika Supabase/TeleBand tetap milik
    repo ini. Sengaja TIDAK dibawa: loop hero & ilustrasi `hub`/`produk` (memuat TeleRing — diganti
    render TeleBand & `analisis`), ikon TeleRing di galeri, video seksi #video (seksinya tersembunyi),
    promosi/, blender/, tools/, tests/, firebase.json.
38. **EKG kembali, sesi makan → riwayat makanan, tab Respons dihapus** (2 Okt, permintaan user).
    - Kartu EKG bersama `kartuEkg()` (views-home.js) di Beranda pasien dan detail pengguna admin.
      Sempat berisi gelombang sintetis yang digerakkan detak jantung; atas permintaan user dihapus —
      kini kartu KOSONG "Menunggu data EKG dari TeleBand" sampai firmware/protokol BLE mengirim
      sampel EKG sungguhan (TeleBand saat ini tidak punya elektroda EKG). `EcgRenderer(canvas, { hr })`
      masih ada di engine.js, hanya dipakai jalur simulasi.
    - Sesi makan (titik gula darah 2 jam, layar Sesi Berjalan) dihapus. `Meals.catat(items, foto, waktu)`
      langsung ke riwayat (`v: 3`), ada kolom Waktu makan dan tombol hapus (`Meals.hapus` +
      `PatientsDB.hapusSesi`). `Meals.tick()` kini hanya memindahkan `activeMeal` lama ke riwayat;
      `sesi_berjalan` dikirim null. Rute `/sesi/*` dipertahankan namanya.
    - Penilaian gizi per tujuan: `Meals.nilaiMakanan` (per makan, patokan target ÷ 3; ambang khusus
      bulking/naik-massa, turun-berat, gula-stabil, jaga-berat) dan `saranHarian` di kartu target.
      Riwayat dikelompokkan per hari dengan total vs target. Analisis: tab "Respons" dihapus
      (`?tab=sesi` jatuh ke Vital). Kartu Puncak Gula Darah di Beranda ikut dihapus.
    - Diuji via CDP (Edge headless): alur pasien lengkap + detail admin dengan DB tiruan, tanpa galat.
39. **Tanpa nama "Gemini" di layar + Wawasan TeleCare AI dari Gemini** (2 Okt, permintaan user).
    - Teks layar deteksi makanan tak lagi menyebut Gemini; galat server disaring `pesanDeteksi()`.
    - Edge Function `deteksi-makanan` dirapikan: `panggil()` bersama (pilih model, 404/503 ulang) +
      mode `wawasan` → `{ judul, isi }`. Klien `TC.DeteksiDB.wawasan()`. Beranda (`muatWawasanAI`)
      tampilkan kalimat aturan dulu, lalu ganti hasil AI; cache localStorage `telecare.wawasan.v1` per
      tanda tangan data (pakai hasil ukur TERSIMPAN, bukan angka langsung), jeda 2 mnt bila gagal.
      **Perlu deploy ulang fungsi** — versi lama menjawab 400 dan Beranda tetap memakai kalimat aturan.
      Diuji via CDP dengan wawasan tiruan (panggil, cache, panggil ulang saat makanan baru, gagal).
40. **Hasil ukur lintas perangkat** (5 Okt, commit f905dc5..3f33b73). Tren 7 hari & detail pasien admin
    memakai RATA-RATA harian (bukan terendah). `Readings` kini bertanda `pemilik` (id akun lokal) +
    `adopsi()` untuk hasil lama, dan `Readings.tarik()` menarik `device_readings` akun ini dari server
    (dipanggil `tarikHasil` di app.js: onStatus, hashchange, visibilitychange; jeda 30 dtk).
    `FB._authOnce` ikut diganti di onAuthStateChange (anonim → Google), kalau tidak kueri "milik
    saya" memakai user_id lama.
41. **Profil & makanan per akun + sinkron dua arah** (5 Okt, keluhan user: "login Google di HP, ukur
    di HP, buka di laptop dengan Google sama — catatannya tidak ada").
    - Sebab: profil, target gizi, dan catatan makanan hanya DIKIRIM ke server (untuk admin), tidak
      pernah ditarik; dan semuanya satu untuk seluruh peramban sehingga akun kedua melihat — dan
      mengunggah atas namanya — data akun pertama.
    - core.js: `profile`, `meals`, `activeMeal`, `notifications` milik `state.pemilikData`; milik
      akun lain diparkir di `state.dataAkun[userId]` dan ditukar oleh `sesuaikanPemilik()` (dipanggil
      `Store.masuk(userId)`, `Store.update` sebagai jaring pengaman, dan `load`). Semua titik masuk di
      views-auth.js memakai `Store.masuk()` LEBIH DULU baru mengubah profil. Data versi lama: diakui
      akun yang sedang masuk saat upgrade, atau satu-satunya akun; bila ambigu diparkir di
      `dataAkun._tanpaPemilik` (akun Google memulihkannya dari server).
    - `profile.diubah` (ms) diisi HANYA saat pengguna mengubah profil (Lengkapi Data, Informasi
      Pribadi, pilih tujuan, target sendiri, hitung ulang). Profil server dipakai bila `diubah`-nya
      lebih baru, atau (profil lama tanpa `diubah`) bila server lengkap dan lokal belum.
    - app.js `sinkronPasien` (diekspor `TC.SinkronPasien`): kirim + tarik dalam satu antrean.
      Perangkat TIDAK mengirim sebelum tarikan pertama berhasil (dulu laptop baru menimpa profil server
      dengan profil kosong). Makanan digabung lewat `per.sesi[id]` (pernah tersinkron) — hapus di satu
      perangkat ikut terhapus di perangkat lain, tidak "hidup lagi". Tanda tangan memakai JSON berkunci
      terurut (jsonb tidak menyimpan urutan kunci) → semua catatan terkirim ulang SEKALI setelah update
      (upsert, aman). Profil ikut membawa `nickname` & `diubah`. Sesi Supabase harus milik akun lokal
      (`googleUid`), kalau tidak tarik & kirim diam. Di /lengkapi, profil lengkap dari server langsung
      ke Beranda; layar formulir tidak digambar ulang saat data masuk.
    - Diuji: Node 26/26 (per akun, migrasi lama, laptop baru, hapus lintas perangkat, hapus luring,
      konflik profil, ganti akun saat menunggu, akun tidak cocok) + Edge headless 16/16 dengan
      `*.supabase.co` DIBLOKIR (`--host-resolver-rules`) supaya produksi tidak tersentuh. Catatan uji:
      menulis localStorage lalu reload tidak berguna — `pagehide` menyimpan state memori di atasnya;
      suntik lewat `Page.addScriptToEvaluateOnNewDocument`.
    - Tidak bisa diperbaiki mundur: makanan akun A yang dulu terunggah atas nama akun B di server.
    - Pengaturan → "Data Anda": teks lama "Tidak ada data yang dikirim ke server" (salah sejak #34)
      diganti rincian apa yang disalin ke server, siapa yang bisa membaca, dan apa yang tetap lokal;
      versi admin terpisah (hitungan makanan/hasil ukur disembunyikan). Konfirmasi "Hapus semua data
      lokal" kini menyebut salinan server tetap ada dan dipulihkan saat masuk lagi. (sw.js `v32`)
    - sw.js `v31` (commit dbff997).
42. **Pindah ke Firebase project baru, paket Spark** (5 Okt, perintah Team Lead: tanpa Vercel,
    Supabase, metered.ca; WAJIB 100% gratis; data lama tidak dipindah; Firestore; fitur konsultasi
    tetap mati).
    - Klien: `app/js/firebase-config.js` (config + `TELECARE_AI.models`), `firebase-init.js` (SDK
      12.10.0 dari gstatic lewat `import()` dinamis di skrip klasik → `window.TELECARE_FB`, event
      `telecare:fb-ready`/`-error`), `firebase.js` (menimpa sisa Firebase lama) dengan API SAMA:
      `TC.FB`, `TC.ReadingsDB`, `TC.PatientsDB`, `TC.DeteksiDB`. Layar tidak diubah kecuali teks.
    - Firestore meniru tabel lama: `patients/{uid}`, `patient_meals/{uid}_{id}`,
      `device_readings/{uid}_{serial}_{id}_{epoch}`, `admins/{uid}`; field snake_case, waktu teks ISO.
      RLS → `firestore.rules`; RPC `saya_admin`/`hapus_data_pasien` → `exists(admins)` + batch hapus
      dari klien; upsert ignoreDuplicates → setDoc + aturan "tanpa update" (ditolak & dokumen ada =
      berhasil). Indeks gabungan di `firestore.indexes.json` (user_id+received_at, user_id+at).
    - Tidak ada sesi anonim lagi: `FB.ensureAuth()` menunggu `authStateReady()` dan melempar
      `belum-masuk`. Google lewat popup (cadangan redirect). `FB.uidKini()` membaca
      `auth.currentUser` langsung; `sesiTidakSah()` mengeluarkan sesi lokal pasien/admin bila sesi
      Firebase berakhir atau milik akun lain (setelah `settled`).
    - Gemini: Edge Function → Firebase AI Logic (Gemini Developer API, gratis), dipanggil dari klien;
      model dicoba berurutan (404 → berikutnya, 429/500/503 → ulang sekali), validasi enum/porsi
      dipindah ke klien. Tanpa App Check (kuota bisa dipakai orang lain; tidak ada biaya).
    - Hemat kuota (50 rb baca/hari): tarik data per 5 menit **per akun** (dulu 30 dtk global — bug
      tertangkap E2E: akun kedua tidak pernah ditarik sehingga tidak pernah terdaftar), hasil ukur
      inkremental (`state.kursorHasil[idLokal]`, `ReadingsDB.daftar(..., { sejak })`), kueri admin
      disimpan 60 dtk. Tulisan Firestore diberi batas waktu 15 dtk (luring → tidak pernah selesai).
    - Dicabut: `supabase-init.js`, `supabase.js`, `rtc-config.js` (kredensial TURN), `supabase/`,
      `vercel.json`, `.vercelignore`, `js/firebase-init.js` (landing → RTDB lama; dashboard kini
      selalu "SIMULASI LOKAL"), `database.rules.json`, `functions/`. Push server (`send-push`, VAPID)
      dimatikan — `Push.daftarWebPush()` kini no-op. `firebase.json`: Hosting + Firestore;
      `.firebaserc` berisi `GANTI-projectId`. sw.js `v40-firebase`, host Firebase tanpa cache.
    - Diuji: aturan Firestore 54/54 di emulator; E2E Edge ↔ emulator Auth+Firestore 41/41 (HP →
      laptop, hapus lintas perangkat, dua akun satu peramban, admin masuk/tolak/daftar/detail/hapus,
      11 layar tanpa galat); AI Logic dengan SDK Schema asli + model tiruan 20/20; uji lama 26/26 &
      19/19. Emulator butuh Java 21 (komputer ini Java 17 → JRE 21 portabel di folder sementara).
      Produksi diblokir di Edge (`--host-resolver-rules`), konfigurasi uji disuntik lewat CDP
      `Fetch.fulfillRequest`, service worker dilewati (`Network.setBypassServiceWorker`).
    - Belum: project sungguhan (PANDUAN-FIREBASE.md), uji Gemini sungguhan, uji ulang TeleBand
      fisik. Fitur konsultasi/dokter/unit masih kode Supabase (tersembunyi).
    - Pelajaran: jangan menulis teks berisi backtick lewat `node -e "..."` di Bash — backtick
      dijalankan sebagai perintah. Dan jangan potong berkas dengan `slice(indexOf(...))` tanpa
      memeriksa -1: MEMORY.md sempat terpotong ke 73 baris (dipulihkan dari git sebelum commit).
43. **TeleBand dipakai di pergelangan tangan, sensor di titik denyut nadi — bukan jari** (5 Okt,
    penegasan user). Aplikasi dulu menyuruh "tempelkan ujung jari" (terbawa dari label state di
    `tools/web-test` teknisi), padahal firmware (`ppg.cpp`, salinan 25 Sep di
    `D:\Data_C_Fito\joki\TeleCare`) disetel untuk pergelangan: arus LED maksimum dan
    `SPO2_WRIST_OFFSET = +16.8` pada SETIAP hasil. Akibat mengukur di jari: SpO₂ hampir selalu 100%.
    Teks diganti di views-teleband.js (subjudul + petunjuk mengukur), teleband-ble.js (state 1 =
    "sensor belum menempel", sesuai `TC_ST_TAK_MENEMPEL` di tc_proto.h), data.js (desc TeleBand),
    views-home.js (penjelasan glukosa), views-profile.js (langkah kalibrasi TD). Teks TeleRing
    (cincin, tersembunyi) tetap menyebut jari — memang benar untuk cincin.

---

## 4. Keputusan teknis & alasannya

> Butir bertanda Supabase/RTDB/Realtime/TURN di bawah ini berlaku untuk era sebelum #42. Yang
> masih relevan setelah pindah ke Firebase: native tanpa framework, skrip global, nama API
> dipertahankan, data lokal di localStorage, keputusan TeleBand 4A–4D, Vitals per metrik,
> service worker jaringan-lebih-dulu.

**Native, tanpa framework.** Diminta secara eksplisit. Routing, state, dan komponen ditulis sendiri
di [app/js/core.js](app/js/core.js). Berkas yang di-deploy sama persis dengan yang ada di repo.

**Skrip global, bukan ES module (di aplikasi).** Urutan muat dijamin urutan `<script>` di
[app/index.html](app/index.html); semua berbagi namespace `TC`. SDK Supabase dimuat sebagai UMD
dari CDN oleh [supabase-init.js](app/js/supabase-init.js), yang memancarkan `telecare:sb-ready`;
`sbClient()` di `supabase.js` menunggu event itu (batas 10 detik).

**Nama API Firebase dipertahankan setelah migrasi.** `TC.FB`, `TC.Chat`, `TC.RTC` tetap bernama
sama supaya layar tidak perlu diubah. `FB.ready` di-set `true` **sebelum** SDK selesai dimuat, karena
setiap fungsi `Chat.*`/`RTC.*` menunggu sendiri; tanpa itu pemanggilan awal terlewat.

**Data aplikasi di localStorage.** Kunci `telecare.app.v1`. Hanya percakapan, keanggotaan, kotak
masuk panggilan, direktori dokter, dan langganan push yang ada di server.

**Mirror lokal ditulis lebih dulu.** `Consult.push()` menyimpan ke localStorage, baru INSERT ke
server; dedup lewat `mid`. Pesan langsung muncul walau jaringan lambat, dan tidak hilang saat luring.

**Riwayat diambil manual sebelum berlangganan.** `postgres_changes` hanya menyiarkan baris baru,
berbeda dari `child_added` RTDB yang ikut mengirim riwayat.

**Sinyal WebRTC lewat Broadcast, bukan tabel.** Offer/answer/ICE bersifat sementara; menyimpannya
hanya menambah pembersihan. Pengirim offer ditentukan Presence: ID peer lebih kecil yang mengirim,
dievaluasi ulang pada setiap `sync` supaya tidak ada celah di mana kedua sisi merasa sendirian.

**`doctor_directory` terpisah dari status jaga.** Presence menjawab "sedang online?", direktori
menjawab "akun mana dokter ini?". Memisahkannya membuat panggilan tetap bisa ditujukan (dan
di-push) ke dokter yang aplikasinya tertutup.

**Pesan kartu membawa `kind`, `data`, dan `text` sekaligus.** `text` selalu berisi ringkasan
terbaca, jadi pesan tetap bermakna di notifikasi dan ketika kolom `kind`/`data` belum ada. Klien
mencoba INSERT dengan kedua kolom; bila PostgREST menjawab `PGRST204`/`42703`, klien mengingatnya
dan mengirim tanpa kolom itu untuk sisa sesi. Kartu sesi makan membawa ringkasannya sendiri
(`Consult.mealCard`), bukan hanya id, karena penerima tidak punya riwayat makan pengirim.

**TeleBand: keputusan tim 4A–4D (25 Sep 2026).** Alat ini *spot-check*, bukan wearable kontinu.
(A) LIVE hanya pratinjau; angka stabil (bukan `sementara`) masuk Vitals, HASIL yang disimpan.
(B) Glukosa disimpan dan ditampilkan berlabel eksperimental. (C) Suhu tetap simulasi berlabel.
(D) HASIL ke tabel Supabase `device_readings`; HAPUS ke alat hanya setelah server mengonfirmasi.

**TeleBand: jalur terpisah dari ble.js.** Instruksi tim: jangan ubah parser SIG standar. Protokolnya
beda total (UUID `7e1e000x-5443-4172-652d-54656c654361`, paket biner LE buatan sendiri).

**TeleBand: dedup serial + id + epoch.** `tc_store.cpp` menyimpan id sebagai u16 di NVS yang kembali
ke 1 setelah 65535 dan setelah NVS dihapus. Batas nilai di tabel sengaja longgar (rentang byte),
karena baris yang ditolak server tidak pernah di-HAPUS dan akan dikirim ulang selamanya.

**TeleBand: `onInfo` sebelum berlangganan.** Paket HASIL bisa tiba sebelum `connect()` selesai;
penerima perlu serial alat untuk kunci dedup.

**Vitals per metrik (`dariAlat`).** Dulu satu sakelar `source` membekukan SEMUA metrik saat perangkat
tersambung. Kini hanya metrik yang benar-benar dikirim alat yang berhenti disimulasikan. Ini juga
mengubah jalur BLE generik: metrik yang tidak dikirim perangkat generik kini tetap bergerak
(simulasi, berlabel), bukan membeku.

**Eskalasi mengabaikan estimasi eksperimental.** Tensi TeleBand tidak memicu peringatan; label
"(simulasi)" pada notifikasi kini dinilai per ukuran.

**Percakapan contoh tamu hanya lokal (`local: true`).** Lihat §5. `Consult.isLocal()` juga
mengenali ID lama `'cs-demo'` agar data yang sudah ada di localStorage pengguna ikut aman.

**ID konsultasi kriptografis.** ID itu sekaligus ID ruang panggilan dan dibagikan lewat tautan
undangan, jadi ia kunci akses. `secureId()` memakai `crypto.getRandomValues` (± 128 bit).

**`FB.canSync()` memisahkan "tersambung" dari "boleh menulis".** Tersambung (kanal heartbeat
`SUBSCRIBED`) **dan** punya sesi **dan** tidak ada `authFatal`.

**Mode demo mempercepat waktu.** Sesi makan 2 jam dipadatkan jadi ± 2 menit (`settings.fastDemo`).

**Peran disimpan di `user.role`.** Rute dijaga lewat `opts.roles`; navigasi dari `TABS_BY_ROLE`.

**Service worker: kode sendiri jaringan-lebih-dulu.** Tanpa build step, nama berkas tidak memuat
sidik isi; cache-first membuat deploy baru butuh dua kali muat ulang.

---

## 5. Bug yang pernah ditemukan (jangan terulang)

| Bug | Sebab | Perbaikan |
| --- | --- | --- |
| **Kartu vital/sesi makan tampil sebagai gelembung kosong di perangkat lawan bicara** | Setelah migrasi, `Chat.send` hanya mengirim `from`/`text`/`mid`; kartu punya `text: ''` dan tabel `messages` tidak punya kolom `kind`/`data` | Kolom `kind`+`data` (migrasi `20260925_messages_kind_data.sql`), `text` ringkasan untuk setiap kartu, cadangan otomatis bila kolom belum ada, gelembung tanpa teks dilewati |
| **Semua akun tamu berbagi satu percakapan dan satu ruang panggilan** | Percakapan contoh ber-ID tetap `'cs-demo'`; sejak `Consult.start()` memakai ulang percakapan aktif, "Mulai Chat" dengan dr. Anindya (d1) mengirim ke `cs-demo`, dan Video Call dari sana bergabung ke kanal `call:cs-demo` milik semua tamu | ID acak + `local: true`; percakapan lokal tidak pernah dikirim, tidak dipakai ulang oleh `start()`, tanpa presence/undangan, dan panggilan darinya dialihkan ke percakapan baru |
| Nilai kartu vital disisipkan ke HTML tanpa escape | Dulu datanya hanya lokal; kini `data` datang dari server dan bisa ditulis peserta lain | Semua nilai kartu lewat `esc()` |
| Tata letak melebar, kartu terpotong | `icon()` menghasilkan `<svg>` tanpa kelas → 300×150 | Aturan `svg:not([class])` di reset CSS |
| Video Blender gagal ditulis | Blender 5.x memindahkan output video ke `image_settings.media_type` | Set `media_type = 'VIDEO'` dulu |
| Animasi turntable gagal | Blender 5.x memakai *slotted Action* | Helper `iter_fcurves()` |
| Layar jam tertelan bodi / bintik kaca | Bezel di dalam kubus padat / noise EEVEE | Rim menonjol; layar emisif ber-clear coat |
| Panggilan selalu "solo" | Status online dinilai sebelum koneksi terbentuk | `FB.waitOnline()` menunggu maks. 7 detik |
| **Tautan undangan tidak sampai** | `?demo=` menyemai akun lalu membajak rute ke `/home` | `seedDemoUser(false)` mempertahankan rute URL |
| Listener sheet menumpuk | `#overlay` dipakai ulang | Simpul overlay diganti tiap kali dibuka |
| Padding bawah nyangkut di desktop | Inline `--tabbar-h` menimpa media query | Kelas `body.is-bare` |
| Peserta bisa menambah/mengeluarkan peserta lain (era RTDB) | `.write` di `meta` menurun ke anak | Izin per field. **Pelajaran untuk RLS:** kebijakan `consult_members` harus memaksa `user_id = auth.uid()` |
| UI mengaku "tersambung" padahal tulisan ditolak | Sesi gagal tidak mengubah status online | `FB.canSync()` |
| Pesan pertama ditolak pada percakapan baru | `send` tidak menunggu keanggotaan | `Chat.join` ter-memo jadi prasyarat |
| Seluruh `.git` tersaji publik di Firebase Hosting | Pola ignore `**/.*` | Pola tambahan. **Pelajaran untuk Vercel:** periksa `.vercelignore` bila menambah folder |
| Papan jaga usang mendering perangkat mati (era RTDB) | `onDisconnect` tidak menolong saat proses mati mendadak | Kini Presence, yang hilang sendiri saat koneksi putus |
| Judul tab baru berubah setelah 900 ms | Penggantian hanya di `setInterval` | Diganti seketika |
| Catatan klinis pada milidetik sama terbalik | Sort seri | Indeks penyisipan sebagai pemecah seri |
| Komentar HTML muncul sebagai teks | `<!-- -->` di dalam literal templat | Jadi komentar JS |
| Puluhan proses Edge menumpuk saat pengujian | Timer halaman tidak pernah berhenti | Tunggu dengan batas lalu `taskkill /PID /T /F` |
| Tangkapan layar headless kosong | `--disable-sync` | Flag dibuang untuk `--screenshot` |
| Masalah skrip PowerShell/ffmpeg/CapCut | Lokal desimal koma, variabel tak peka huruf, `$d:` terbaca sebagai cakupan, stderr dianggap galat | `InvariantCulture`, ganti nama variabel/fungsi, `$($d):`, nilai dari kode keluar |
| Bantalan suara video tak terdengar | `amix` + `volume` → puncak -37 dB | `loudnorm=I=-24:TP=-3` |

---

## 6. Cara verifikasi yang dipakai

- **⚠️ Pengujian memakai Edge, bukan Chrome — dan tidak pernah mematikan proses berdasarkan nama.**
  `Get-Process chrome | Stop-Process -Force` pernah **mematikan seluruh tab browsing pemilik
  komputer**. [tools/uji-browser.ps1](tools/uji-browser.ps1) memaksa Edge, profil sementara, dan
  penghentian lewat PID sendiri. `*>` di PowerShell 5.1 menulis log UTF-16LE.
- **Uji logika di Node dengan stub peramban** (25 Sep, 15 pemeriksaan): `core.js` + `data.js` +
  `supabase.js` + `engine.js` dimuat di `vm` dengan `localStorage`/`document` tiruan dan client
  Supabase palsu. Diperiksa: `isLocal` untuk `cs-demo` lama dan `local: true`; `start()` tidak
  memakai ulang percakapan contoh tetapi memakai ulang percakapan nyata; pesan percakapan contoh
  tidak dikirim; kartu mendapat `text` ringkasan dan `kind` ikut terkirim; `dariBaris` membawa
  `kind`/`data`; cadangan INSERT saat `PGRST204` terjadi sekali lalu diingat. Skripnya belum
  disimpan di repo (lihat §8).
- **TeleBand dengan alat BLE tiruan** (25 Sep, 55 pemeriksaan). Paket disusun byte demi byte
  menurut `PROTOKOL_BLE.md`; alat tiruan meniru firmware (kirim hasil tersimpan saat HASIL
  dilanggani, HAPUS menghapus, SINKRON mengirim ulang) dan Chrome (menolak tulisan GATT paralel).
  Diperiksa: parser keempat paket termasuk "bit menyala tapi nilai 0", epoch 0, paket pendek;
  urutan INFO → notifikasi → SET_WAKTU; nol tulisan paralel walau tiga perintah ditembak beruntun;
  HAPUS hanya untuk hasil yang sampai server; hasil gagal tetap di alat lalu tersimpan saat sambung
  ulang; tanpa duplikat lokal/server; id berulang dengan epoch lain = hasil baru; LIVE sementara
  tidak masuk Vitals; suhu tetap simulasi; putus → simulasi. Plus render 5 rute di Edge headless.
  Uji ini tidak menangkap masalah pairing/bond — itu baru terlihat dengan alat fisik (lihat §3 butir 23).
- **Memeriksa skema Supabase dari luar:** `GET /rest/v1/messages?select=kind,data&limit=0` dengan
  header `apikey` (anon) — balasan `42703 column ... does not exist` berarti migrasi belum jalan.
- **Sapuan rute** headless `--dump-dom` per peran, cari `Terjadi kesalahan` dan DOM terlalu pendek.
- **Ambang eskalasi (51), muatan push (23), catatan klinis (29), parser GATT (42)** — pemeriksaan
  era sebelumnya; logikanya tidak berubah oleh migrasi.
- Pemeriksaan aturan RTDB (41), jalur klien Firebase (12), dan dering dua peramban (28) **sudah
  tidak berlaku** setelah migrasi; padanan Supabase-nya belum dibuat (§8).

---

## 7. Utang teknis & batasan yang diketahui

Urut dari yang paling perlu diselesaikan. (Daftar era Supabase ada di riwayat git, commit dbff997.)

1. **Project Firebase `app-telecare` belum di-deploy.** Config, `.firebaserc`, dan domain
   (`app-telecare.web.app` di `index.html`, `robots.txt`, `sitemap.xml`) sudah diisi. Sisa:
   `firebase deploy`, lalu daftar uji Bagian 8 [PANDUAN-FIREBASE.md](PANDUAN-FIREBASE.md).
2. **Gemini via AI Logic belum dicoba ke layanan sungguhan.** Logika diuji dengan model tiruan.
   Nama model di `TELECARE_AI.models` bisa dipensiunkan Google — ubah daftar itu bila deteksi gagal.
3. **TeleBand fisik perlu diuji ulang** dengan jalur simpan Firestore (terakhir terbukti di era Vercel).
4. **AI Logic tanpa App Check** — kuota Gemini gratis project bisa dipakai siapa pun yang tahu
   konfigurasinya (tidak ada biaya; kuota bisa habis). App Check + reCAPTCHA bisa ditambahkan.
5. **Kuota gratis Firestore (50 rb baca/hari).** Sudah dihemat (tarik per 5 menit per akun, hasil
   ukur inkremental, kueri admin 60 dtk), tetapi dasbor admin membaca hingga 2.000 hasil ukur + 1.000
   pasien setiap kali simpanan 60 dtk-nya habis. Pantau Console → Firestore → Usage bila pengguna bertambah.
6. **Fitur tersembunyi masih kode Supabase:** konsultasi/chat/panggilan (`views-care.js`,
   `ring.js`, `ring-ui.js`, `Consult` di engine.js, layar TURN di Pengaturan), dokter (`TC.CareDB`),
   unit (`TC.FacilityDB`). Jangan nyalakan `TC.FITUR` terkait sebelum diport. Panggilan video butuh
   TURN dari luar Firebase.
7. **Push dari server tidak ada** (butuh Cloud Functions/Blaze). Hanya notifikasi lokal.
8. **Vercel & Supabase lama masih hidup** sampai dimatikan pemiliknya (PANDUAN Bagian 9); selama itu
   `gelang-cerdas.vercel.app` menayangkan versi Supabase. Kredensial TURN metered.ca pernah ada di
   repo publik — perlu diputar ulang.
9. **Uji otomatis belum tersimpan di repo** (Node, aturan Firestore, E2E emulator ada di folder
   sementara sesi kerja). Sebaiknya dipindah ke `tests/` (perlu `package.json` + Java 21).
10. **Kartu EKG kosong** sampai firmware TeleBand mengirim sampel EKG; UI `SET_KALIBRASI` belum ada.

---

## 8. Rencana berikutnya

- [ ] Pemilik project mengerjakan PANDUAN-FIREBASE.md (project, Auth, Firestore, AI Logic, admin)
- [ ] Isi `firebase-config.js` + `.firebaserc`, `firebase deploy`, coba alur Bagian 8 panduan
- [ ] Uji TeleBand fisik & deteksi makanan Gemini di situs Firebase
- [ ] Matikan Vercel & Supabase, putar ulang kredensial metered.ca
- [ ] Simpan uji (aturan Firestore, E2E emulator, Node) ke `tests/`
- [ ] App Check untuk AI Logic (opsional)
- [ ] TeleBand tahap 2: UI kalibrasi per unit (`SET_KALIBRASI`)
- [ ] Bila konsultasi dibutuhkan lagi: port chat ke Firestore (`onSnapshot`), sinyal WebRTC ke
      Firestore, cari TURN gratis/self-hosted

---

## 9. Peta berkas singkat

```
index.html · css/style.css · css/fx.css · css/neu.css   situs penelitian
js/three-scenes.js · js/transitions.js       3 scene Three.js, transisi
js/app.js                                    dashboard landing (simulasi berlabel)

app/index.html                               shell aplikasi + sprite ikon
app/css/app.css                              sistem desain aplikasi
app/js/firebase-config.js                    config project Firebase + model Gemini (diisi per project)
app/js/firebase-init.js                      memuat Firebase SDK 12.10.0 → window.TELECARE_FB
app/js/core.js                               util, Store (data per akun), router, UI, grafik, TC.FITUR
app/js/data.js                               perangkat, makanan, tujuan, peran (+ katalog contoh)
app/js/firebase.js                           TC.FB / ReadingsDB / PatientsDB / DeteksiDB
app/js/ble.js                                GATT standar + IEEE-11073 (perangkat generik)
app/js/teleband-ble.js                       protokol BLE TeleBand (alat fisik tim)
app/js/views-teleband.js                     layar #/teleband
app/js/engine.js                             vital, perangkat, makanan & gizi, Readings, TeleBandLink
app/js/push-config.js · app/js/push.js       ambang eskalasi, notifikasi lokal
app/js/ring.js · ring-ui.js · views-care.js  konsultasi/panggilan — TERSEMBUNYI, kode era Supabase
app/js/views-*.js                            layar per bagian dan per peran
app/js/app.js                                rute, navigasi, sinkron data pasien dua arah, boot
app/manifest.webmanifest · app/sw.js         PWA

firebase.json · .firebaserc                  Hosting + Firestore, ID project
firestore.rules · firestore.indexes.json     aturan keamanan & indeks Firestore
PANDUAN-FIREBASE.md                          langkah Console/deploy untuk pemula
blender/build_assets.py                      generator aset 3D
tools/                                       server lokal, uji headless, video, cek deploy
```

---

## 10. Perintah yang sering dipakai

```bash
# jalankan lokal — pakai tools/serve.py, BUKAN python -m http.server (MIME .js di Windows)
python tools/serve.py 8950

# deploy (situs + aturan + indeks); hanya situs: --only hosting; hanya aturan: --only firestore
firebase login
firebase deploy

# bandingkan berkas lokal dengan yang tersaji di <projectId>.web.app
powershell -NoProfile -ExecutionPolicy Bypass -File tools\cek-deploy.ps1

# emulator (butuh Java 21+), dengan firebase.json yang menunjuk ke firestore.rules
firebase emulators:start --only firestore,auth --project demo-telecare

# bangun ulang aset 3D (± 2–5 menit; --stills-only melewati video)
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -noaudio \
  -P blender/build_assets.py -- --root "<path repo>"

# bangun ulang video showcase (server lokal harus hidup untuk tahap pertama)
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tangkap-layar.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bangun-video.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bangun-capcut.ps1 -Bersihkan
```
