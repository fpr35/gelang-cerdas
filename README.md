# TeleCare

**Platform Telemedisin AIoT Terpadu untuk Pencegahan Penyakit Kronis dan Manajemen Gaya Hidup Berbasis Health 5.0**

Situs profil penelitian + aplikasi web — HTML, CSS, dan JavaScript native (tanpa framework, tanpa langkah build).

| Layanan | Dipakai untuk |
| --- | --- |
| **Vercel** | Hosting statis (situs penelitian + aplikasi `/app/`) |
| **Supabase** | Auth (anonim + Google), Postgres (chat, kotak masuk panggilan, langganan push), Realtime (sinyal WebRTC, kehadiran), Edge Function `send-push` |
| **metered.ca** | Server STUN/TURN untuk panggilan WebRTC di balik NAT ketat |

- **Tautan demo per peran:** `/app/?demo=pasien` · `?demo=dokter` · `?demo=admin-faskes` · `?demo=admin`
- **Repositori:** https://github.com/fpr35/gelang-cerdas
- **Komisaris pembimbing:** Dr. Fuad Anwar, S.Si., M.Si.
- **Tim:** Fajar Jelang Riyadi (M0222027) · Faizal Tri Widiandika (M0222026) · Sholeh Putra Utama (M0222083) — Fisika, FMIPA

> **Melacak progres?** Lihat [MEMORY.md](MEMORY.md) — status per bagian, keputusan teknis
> beserta alasannya, bug yang pernah ditemukan, utang teknis, dan rencana berikutnya.

---

## Struktur

```
index.html                  situs penelitian (landing page)
app/                        aplikasi TeleCare (SPA, hash routing, PWA)
404.html                    halaman galat, gaya sama
robots.txt / sitemap.xml    metadata pengindeksan
vercel.json / .vercelignore konfigurasi hosting Vercel
supabase/migrations/        perubahan skema Supabase yang dilacak di repo (lihat catatan skema)
css/style.css               sistem desain (palet Kemenkes RI), tata letak, komponen
css/fx.css                  transisi antar-bagian, HUD, ikon SVG teranimasi
js/app.js                   dashboard: EKG sintetis, sparkline, tren 24 jam, gauge stres
js/three-scenes.js          tiga scene Three.js (hero, viewer produk, holo Health 5.0)
js/transitions.js           overlay transisi, pengungkap bertahap, penghitung angka
js/firebase-init.js         SISA LAMA — lihat "Sisa Firebase" di bawah
blender/build_assets.py     generator aset 3D — sumber tunggal semua model & render
assets/models/*.glb         model untuk viewer Three.js
assets/video/*.mp4          render turntable + dua video showcase
assets/img/render-*.png     still transparan (+ varian .webp)
assets/img/og-cover.png     kartu pratinjau media sosial 1200x630
tools/serve.py              server lokal dengan MIME type yang benar
tools/uji-browser.ps1       pembantu pengujian Edge headless (DOM + tangkapan layar)
tools/tangkap-layar.ps1     tangkap 39 halaman x 2 ukuran ke build/shots
tools/bangun-video.ps1      rangkai dua video showcase dengan ffmpeg
tools/bangun-capcut.ps1     buat dua draft CapCut yang bisa disunting lanjut
tools/cek-deploy.ps1        bandingkan sidik SHA256 berkas lokal dengan produksi
```

## Menjalankan secara lokal

```bash
python tools/serve.py 8899
# buka http://127.0.0.1:8899
```

Harus lewat HTTP server, bukan `file://` — modul ES, pemuatan GLB, dan service worker memerlukan
origin yang sah. Supabase dan metered.ca tetap diakses langsung dari peramban, jadi chat dan
panggilan juga berfungsi saat dijalankan lokal.

`python -m http.server` juga bisa dipakai untuk situs penelitian, tetapi **tidak untuk menguji
service worker di Windows**: pemetaan MIME diambil dari registry, dan `.js` di sana sering
terdaftar sebagai `text/plain` sehingga peramban menolak mendaftarkan service worker.

## Deploy

Hosting di **Vercel** sebagai situs statis dari akar repositori (tanpa build). `vercel.json`
mengaktifkan `cleanUrls` dan `trailingSlash`; `.vercelignore` mengecualikan `blender/`, `tools/`,
`build/`, `functions/`, berkas `.blend`, `.md`, `.py`, dan log.

Perubahan skema Supabase **tidak** ikut ter-deploy bersama situs — jalankan berkas di
`supabase/migrations/` lewat Supabase Dashboard → SQL Editor.

Setiap kali kerangka aplikasi berubah, naikkan `VERSION` di [app/sw.js](app/sw.js) supaya cache
lama dibuang di perangkat pengguna.

---

## Aplikasi TeleCare (`/app/`)

SPA native, responsif: tab bar di bawah pada layar sempit, sidebar pada layar lebar. Semua berkas
adalah skrip klasik yang berbagi satu namespace `window.TC`; urutan muatnya ditentukan urutan
`<script>` di [app/index.html](app/index.html).

```
app/index.html          shell + sprite ikon SVG
app/css/app.css         sistem desain aplikasi
app/js/supabase-init.js memuat SDK Supabase dari CDN, membuat client (URL + anon key)
app/js/core.js          util, penyimpanan lokal (Store), router, komponen UI, grafik canvas/SVG
app/js/data.js          katalog perangkat, spesialisasi, dokter, makanan, peran, faskes, pasien contoh
app/js/rtc-config.js    server STUN/TURN (metered.ca)
app/js/supabase.js      TC.FB (sesi & status), TC.Chat (pesan), TC.RTC (WebRTC)
app/js/ble.js           pembacaan GATT standar (perangkat generik) + parser IEEE-11073
app/js/teleband-ble.js  protokol BLE khusus TeleBand (alat fisik tim)
app/js/engine.js        vital, kalibrasi, hub perangkat, sesi makan, konsultasi, catatan klinis,
                        hasil ukur (Readings) dan sambungan TeleBand (TeleBandLink)
app/js/push-config.js   VAPID public key + jeda notifikasi
app/js/push.js          ambang eskalasi, notifikasi lokal, langganan Web Push
app/js/ring.js          panggilan masuk: papan jaga, kotak masuk, dering
app/js/ring-ui.js       overlay panggilan masuk di perangkat dokter
app/js/views-*.js       layar: auth, beranda/analisis, sesi makan, telemedisin, profil, peran
app/js/app.js           daftar rute, navigasi per peran, boot
app/sw.js               service worker (PWA + penerima push)
```

**Fitur yang disembunyikan** — `TC.FITUR` di [app/js/core.js](app/js/core.js). Kodenya tetap utuh;
yang disembunyikan hanya titik masuknya (tab, tombol, tautan), dan rutenya dialihkan ke beranda.
Ubah ke `true` untuk memunculkannya kembali.

| Sakelar | Saat `false` |
| --- | --- |
| `daftarAkun` | layar `/daftar` dan tautan "Daftar sekarang" hilang; masuk hanya lewat Google atau Tamu |
| `konsultasi` | konsultasi, chat, panggilan, janji temu, antrean dokter, dan dering panggilan dokter hilang |
| `simulasi` | tidak ada angka buatan: vital "—" tanpa TeleBand, sesi makan diisi glukosa TeleBand, tamu mulai kosong, dokter melihat pasien asli |
| `peranAdmin` | peran Admin Platform (seluruhnya data contoh) tidak dapat dipilih |
| `peranDokter` | peran dokter (klinik, kode dokter, nakes unit) tidak ada |
| `akunTamu` | tidak ada "Masuk sebagai Tamu" maupun tautan `?demo=` |
| `gantiPeran` | baris "Ganti peran" di Profil tidak tampil |
| `unit` | tanpa unit berkode: admin otomatis memantau **semua** pasien (migrasi `20260928_patients.sql`) |

**Akun admin** (migrasi [supabase/migrations/20260927_admins.sql](supabase/migrations/20260927_admins.sql)):
buat pengguna di Supabase Dashboard → Authentication → Users → *Add user* (centang Auto Confirm), lalu
`insert into public.admins (user_id) select id from auth.users where email = '...';`.
Admin masuk di **`/app/#/masuk/admin`** — halaman ini sengaja tidak ditautkan dari mana pun.

**Deteksi makanan (Gemini)**: Edge Function [supabase/functions/deteksi-makanan](supabase/functions/deteksi-makanan/index.ts).
`supabase secrets set GEMINI_API_KEY=...` lalu `supabase functions deploy deteksi-makanan`.
Kunci Gemini hanya ada di server; foto makanan dikirim ke Google untuk dikenali.
Fungsi yang sama juga menyusun **Wawasan TeleCare AI** di Beranda (`mode: 'wawasan'`): aplikasi
mengirim ringkasan angka (tujuan, target, asupan hari ini, hasil ukur terakhir — tanpa nama/email).

**Hubungan dokter–pasien** butuh migrasi [supabase/migrations/20260926_care_links.sql](supabase/migrations/20260926_care_links.sql)
dijalankan sekali di Supabase SQL Editor. Alurnya: dokter membuat *kode dokter* di layar Klinik →
pasien memasukkannya di Profil → Dokter saya → dokter dapat membaca hasil ukur TeleBand pasien itu.

**Unit faskes** butuh migrasi [supabase/migrations/20260926_facilities.sql](supabase/migrations/20260926_facilities.sql).
Admin Faskes membuat unit → mendapat *kode unit* → pasien (anggota) dan dokter (nakes) memasukkannya
di Profil → Unit saya → admin melihat hasil ukur TeleBand anggota, triase, inventaris TeleBand yang
terpakai, dan dapat mengunduh laporan CSV.

**Hanya TeleBand yang ditampilkan.** Jenis perangkat lain di katalog (TeleRing, TeleStrap,
TeleCuff, TeleScale, TelePatch) ditandai `tersembunyi: true` di [app/js/data.js](app/js/data.js):
datanya tetap ada (`TC.DATA.DEVICE_TYPES_SEMUA`), tetapi tidak muncul di daftar mana pun. Hapus
tanda itu untuk memunculkannya lagi. Di landing page, bagian perbandingan (`#banding`) dan video
turntable (`#video`) serta tab TeleRing disembunyikan dengan atribut `hidden`.

Halaman **Pindai Perangkat** kini hanya punya satu jalur: TeleBand fisik. Pemindaian simulasi
(`Devices.simulateScan`) dan BLE generik (`Devices.realScan`, `ble.js`) masih ada di kode, tetapi
tidak lagi ditawarkan di layar.

`supabase.js` menggantikan `firebase.js` lama dan **sengaja mempertahankan nama API**
`TC.FB` / `TC.Chat` / `TC.RTC`, supaya layar-layar tidak perlu diubah saat migrasi. Nama `FB`
itu sekarang hanya nama, isinya Supabase.

### Data: apa yang lokal, apa yang di server

| Tempat | Isi |
| --- | --- |
| `localStorage` kunci `telecare.app.v1` | akun lokal, peran, profil, perangkat, sesi makan, salinan percakapan, salinan hasil TeleBand, catatan klinis, kalibrasi, pengaturan |
| Supabase | percakapan dan pesan, keanggotaan percakapan, kotak masuk panggilan, direktori dokter, langganan push, hasil ukur TeleBand (`device_readings`) |
| Supabase Realtime (tidak disimpan) | sinyal WebRTC, kehadiran dokter di percakapan, status jaga dokter |

### Masuk

| Jalur | Keterangan |
| --- | --- |
| Email &amp; kata sandi | Akun lokal di peramban ini (purwarupa, bukan server) |
| Google | Supabase Auth `signInWithOAuth` (alur PKCE, pengalihan halaman) |
| Tamu | Akun demo berisi riwayat contoh; peran dapat dipilih saat masuk |

Terlepas dari jalur yang dipilih, aplikasi selalu memastikan ada sesi Supabase — **anonim** bila
pengguna belum masuk Google (`FB.ensureAuth()` → `signInAnonymously()`), karena tabel-tabel
server hanya dapat ditulis oleh pengguna terautentikasi. Syaratnya: *Anonymous Sign-ins* aktif di
Supabase Dashboard → Authentication. Bila sesi gagal terbentuk, aplikasi berkata jujur
(*"sesi server belum aktif · pesan disimpan lokal"*) dan turun ke penyimpanan lokal.

### Peran

Empat peran dengan navigasi dan layar masing-masing. Peran dapat diganti lewat
**Profil → Ganti peran** (mode purwarupa), atau lewat tautan `?demo=<peran>`.

| Peran | Beranda | Isi |
| --- | --- | --- |
| `pasien` | `/home` | Vital langsung, EKG, sesi makan, analisis, konsultasi, perangkat |
| `dokter` | `/klinik` | Status menerima konsultasi, antrean, pasien binaan + detail vital, riwayat konsultasi & catatan klinis, jadwal |
| `admin-faskes` | `/faskes` | Dashboard unit, triase anggota, inventaris perangkat, daftar nakes |
| `admin` | `/sistem` | Statistik platform, verifikasi dokter, kelola pengguna & faskes, kalibrasi sensor |

Peran disimpan di `localStorage`, **bukan** di server — lihat Catatan keamanan.

### Alur yang tersedia

| Bagian | Isi |
| --- | --- |
| Onboarding & akun | Layar pembuka, daftar, masuk, pemulihan kata sandi, pelengkapan profil |
| Hub perangkat AIoT | Pindai, pasangkan, sinkronkan buffer, putuskan, lupakan — TeleBand, TeleRing, TeleStrap, TeleCuff, TeleScale, TelePatch |
| Perangkat BLE nyata | Pembacaan karakteristik GATT standar lewat Web Bluetooth |
| Pemantauan | Vital langsung, EKG bergulir, tren 7 hari, indeks stres, langkah |
| Sesi makan | Kamera → pengenalan makanan → koreksi → 4 titik pengukuran → kurva respons |
| Telemedisin | Cari dokter, profil, chat, panggilan suara/video, janji temu, riwayat |
| Profil | Informasi pribadi, tujuan gizi, kalibrasi tekanan darah, pengaturan, ekspor data |

### Chat

Percakapan tersimpan di Postgres dan tersinkron antarperangkat secara langsung:

| Tabel | Kolom yang dipakai klien |
| --- | --- |
| `consults` | `id`, `doctor_id`, `mode`, `started_at`, `status` |
| `consult_members` | `consult_id`, `user_id` (unik per pasangan — kode `23505` diabaikan) |
| `messages` | `id`, `consult_id`, `uid`, `from_role` (`me`/`doc`/`sys`), `text`, `mid`, `at`, `kind`, `data` |

- `Chat.join()` mendaftarkan pengguna ke `consult_members` dan menjadi prasyarat setiap operasi
  lain (ter-memo per pengguna+percakapan).
- `Chat.subscribe()` mengambil riwayat sekali lalu mendengarkan `INSERT` lewat
  `postgres_changes` (berbeda dari `child_added` Firebase, riwayat tidak ikut terkirim otomatis).
- `Consult.push()` menulis salinan lokal **lebih dulu**, baru mengirim ke server; pesan ganda
  disaring lewat `mid`. Pesan tetap muncul walau jaringan lambat atau luring.
- `Consult.syncFromServer()` saat boot menarik percakapan yang dimulai dari perangkat lain:
  lewat keanggotaan, dan — untuk dokter — lewat `consults.doctor_id`.

**Pesan kartu.** Ringkasan vital (`kind: 'vitals'`), sesi makan (`'meal'`), dan catatan panggilan
(`'call'`) membawa isinya di `data` (jsonb), dan `text` selalu berisi ringkasan terbaca. Kartu sesi
makan membawa ringkasannya sendiri, bukan hanya id, karena perangkat dokter tidak punya riwayat
makan pasien. Kolom `kind`/`data` ditambahkan oleh
[supabase/migrations/20260925_messages_kind_data.sql](supabase/migrations/20260925_messages_kind_data.sql);
**sebelum migrasi itu dijalankan**, klien otomatis mengirim tanpa kedua kolom (penerima melihat
teks ringkasan, bukan kartu).

**Percakapan contoh akun tamu** ditandai `local: true` dan tidak pernah dikirim ke server, tidak
punya tautan undangan, dan tidak dapat menjadi ruang panggilan — menekan Video Call di sana
membuka percakapan sungguhan baru dengan dokter yang sama.

Di dalam percakapan, peran ikut menentukan perilaku: dokter mengirim pesan sebagai `doc`, dan
**balasan otomatis berhenti** begitu dokter sungguhan hadir — kehadiran itu dibaca dari Realtime
Presence kanal `presence:consult:{id}`.

### Panggilan — WebRTC

- Sinyal lewat **Realtime Broadcast** kanal `call:{consultId}` (event `offer`, `answer`, `ice`,
  `bye`) — tidak ada yang disimpan di database.
- Siapa yang mengirim offer ditentukan **Presence** pada kanal yang sama: bila dua peserta saling
  melihat, peserta dengan ID lebih kecil yang mengirim, sehingga tidak ada offer ganda maupun
  kebuntuan.
- `bye` membuat layar lawan bicara langsung tertutup, tanpa menunggu WebRTC mendeteksi putus.

#### STUN/TURN — metered.ca

Konfigurasi di [app/js/rtc-config.js](app/js/rtc-config.js):

| Kunci | Isi |
| --- | --- |
| `stun` | server STUN (metered.ca + Google) |
| `servers` | kredensial TURN statis metered.ca |
| `fetchFrom` | (opsional) endpoint penerbit kredensial sementara |
| `paksaRelay` | memaksa media lewat TURN, untuk membuktikan TURN bekerja |

Urutan prioritas: pengaturan pengguna (**Profil → Pengaturan → Panggilan**) → `fetchFrom` → `servers`.

> ⚠️ **Kredensial TURN statis saat ini ter-commit di repositori publik.** Siapa pun yang membaca
> berkasnya dapat memakai kuota bandwidth akun metered.ca. Cara yang disarankan: buat kredensial
> sementara lewat API metered.ca (`https://<app>.metered.live/api/v1/turn/credentials?apiKey=...`)
> dari Edge Function Supabase, isi alamat Edge Function itu ke `fetchFrom`, kosongkan `servers`,
> lalu putar ulang (rotate) kredensial lama di dashboard metered.ca.

**Memeriksa TURN:** tombol **Uji konektivitas** di Pengaturan mengumpulkan kandidat ICE tanpa
membuka kamera. `relay = 0` padahal TURN terisi berarti alamat/port/kredensial salah. Setelah
tersambung, layar panggilan membedakan *media lewat TURN* dari *jalur langsung* lewat `getStats()`.

### Panggilan masuk — perangkat dokter berdering

Ketika pasien memulai panggilan, perangkat dokter berdering: overlay layar penuh, nada dering,
getaran, notifikasi sistem, dan judul tab berkedip. Bila nada dering diblokir peramban, overlay
**mengatakannya terus terang**.

| Bagian | Mekanisme |
| --- | --- |
| Direktori dokter | Tabel `doctor_directory` (`catalog_id` → `user_id`), di-upsert saat dokter mulai jaga. Pasien mencari uid dokter di sini, jadi dokter yang aplikasinya tertutup tetap dapat dipanggil (dan menerima push) selama pernah online sekali. |
| Status jaga | Realtime Presence kanal `duty:{doctorId}` — hilang sendiri saat koneksi putus |
| Kotak masuk | Tabel `inbox` (`id`, `to_uid`, `from_uid`, `from_name`, `consult_id`, `mode`, `status`, `at`, `answered_at`), didengarkan lewat `postgres_changes` dengan filter `to_uid` |

Alur: pasien menulis baris `inbox` berstatus `ringing` → dokter berdering → menerima menulis
`accepted` lalu bergabung ke percakapan; pasien melihat perubahan status pada barisnya sendiri.
Tidak dijawab dalam 45 detik menjadi `missed`; baris lebih tua dari 60 detik diabaikan saat
aplikasi dibuka. Sakelar **Menerima konsultasi** di layar klinik menyalakan/mematikan jaga.

Kotak masuk harus dikunci lewat RLS `auth.uid() = to_uid` (plus pemanggil boleh membaca/mengubah
barisnya sendiri), sebab baris itu memuat `consult_id` yang berfungsi sebagai kunci akses.

### Notifikasi

| | Perlu server? | Keadaan |
| --- | --- | --- |
| **Notifikasi lokal** — ambang dinilai di perangkat | tidak | ✅ berfungsi, cukup izin pengguna |
| **Web Push** — sampai walau aplikasi tertutup | ya | langganan disimpan ke `push_subscriptions`; dikirim Edge Function `send-push` yang dipicu Database Webhook |

Web Push memakai standar browser (bukan FCM). Kunci **publik** VAPID ada di
[app/js/push-config.js](app/js/push-config.js); kunci privat hanya boleh ada di Secrets Supabase.
Tabel `push_subscriptions`: `user_id` (unik), `endpoint`, `p256dh`, `auth_key`, `role`, `updated_at`.
Aplikasi memakai **satu** service worker untuk PWA sekaligus penerima push.

Ambang eskalasi ada di `TC.Escalation` ([app/js/push.js](app/js/push.js)):

| Ukuran | Waspada | Kritis |
| --- | --- | --- |
| Detak jantung | &gt;110 atau &lt;50 bpm | &gt;130 atau &lt;45 bpm |
| SpO₂ | &lt;94% | &lt;90% |
| Suhu | ≥37,8 °C | ≥39 °C atau ≤35 °C |
| Tekanan darah | ≥140/90 mmHg | ≥180/120 atau sistol &lt;90 mmHg |

> **Bukan alat kesehatan.** Ambang di atas adalah heuristik penyaring untuk purwarupa, bukan
> kriteria diagnostik.

Satu ukuran tidak diberitahukan ulang sebelum jeda berakhir (bawaan 10 menit), **kecuali**
tingkatannya naik dari waspada menjadi kritis. Bila angka berasal dari simulasi, notifikasi
menyebutkannya. Pemantauan hanya berjalan untuk peran `pasien`.

### TeleBand — alat fisik (ESP32-C6 + MAX30102)

TeleBand memakai **protokol BLE buatan tim sendiri**, bukan profil Bluetooth SIG, jadi punya jalur
terpisah dari `ble.js`. Kontraknya ada di repo firmware (`docs/PROTOKOL_BLE.md`, `tc_proto.h`),
dengan klien referensi `tools/web-test/index.html`.

| Berkas | Isi |
| --- | --- |
| [app/js/teleband-ble.js](app/js/teleband-ble.js) | `TC.TeleBand`: UUID, parser paket INFO/STATUS/LIVE/HASIL, penyusun perintah, sambungan + antrean tulis GATT |
| [app/js/engine.js](app/js/engine.js) | `TC.TeleBandLink` (perekat alat ↔ Vitals ↔ hub perangkat) dan `TC.Readings` (hasil ukur lokal + server) |
| [app/js/views-teleband.js](app/js/views-teleband.js) | layar `#/teleband`: sambung, ukur, pratinjau LIVE, daftar hasil |
| [supabase/migrations/20260925_device_readings.sql](supabase/migrations/20260925_device_readings.sql) | tabel `device_readings` + RLS |

**Alur.** Tombol *Sambungkan TeleBand* → dialog pemilih peramban (hanya unit ber-service
`7e1e0001-…`) → baca INFO (memicu dialog **pairing** OS; itu memang diharapkan) → langgani STATUS,
LIVE, HASIL → tulis `SET_WAKTU`. Semua tulisan ke KONTROL lewat **satu antrean**, karena Web
Bluetooth menolak dua operasi GATT bersamaan.

**Model data (keputusan tim):**

| | Perlakuan |
| --- | --- |
| LIVE (tiap ±1 dtk selama mengukur) | Pratinjau di layar TeleBand; angka `sementara` tampil redup. Hanya angka **stabil** yang masuk `Vitals` (beranda, tren, eskalasi). Tidak disimpan. |
| HASIL (satu per sesi ukur) | Disimpan permanen: salinan lokal `Store.state.readings` + tabel `device_readings`. |
| HAPUS ke alat | Dikirim **hanya setelah server mengonfirmasi**. Gagal → hasil tetap di alat dan dikirim ulang saat tersambung lagi; aplikasi juga mencoba ulang saat dibuka. |
| Dedup | `serial + id + epoch`. `id` saja tidak cukup: u16 di NVS alat yang kembali ke 1 setelah 65535 atau setelah NVS dihapus. |
| Glukosa & tensi | Estimasi **eksperimental** menurut firmware sendiri: disimpan, selalu ditandai `*`/"estimasi eksperimental", **tidak** dipakai untuk peringatan eskalasi. |
| Suhu | Alat tidak punya sensor suhu → tetap simulasi, dilabeli "simulasi" di kartunya. |

Asal angka kini dilacak **per metrik** (`Vitals.sourceOf(k)`, `Vitals.eksperimental(k)`), sehingga
satu beranda dapat berisi angka alat, estimasi eksperimental, dan simulasi sekaligus — masing-masing
berlabel. Kartu glukosa hanya muncul di beranda selama angkanya datang dari alat. Kartu EKG tidak
tampil untuk TeleBand (alat itu tidak punya EKG).

**Syarat:** Chrome/Edge di desktop atau Android, lewat HTTPS atau `localhost`. iOS tidak didukung
(Web Bluetooth tidak ada di iOS). Menguji dengan alat fisik harus lewat `python tools/serve.py`
(localhost) atau situs ter-deploy, bukan `file://`.

**Daftar uji dengan alat fisik** (buka `http://localhost:8899/app/?demo=pasien#/teleband` lewat
`python tools/serve.py 8899`, Chrome/Edge; panel *Lanjutan* di layar itu menampilkan log protokol):

1. Sambungkan → dialog pemilih hanya menampilkan `TeleCare-…`; dialog pairing OS muncul sekali.
2. Log menunjukkan `INFO: protokol v1 …` lalu `→ SET_WAKTU`; kartu *Jam alat* menjadi `OK`.
3. Hasil lama di jam (dari tombol BOOT) muncul di daftar berstatus **di server**, dan log
   menunjukkan `→ HAPUS <id>` untuk masing-masing; *Hasil di alat* turun ke 0.
4. Mulai ukur → angka redup selama `sementara`, lalu tegas; tombol stop berubah menjadi
   *Data cukup — stop*. Beranda menunjukkan detak/SpO₂ "dari TeleBand", suhu "simulasi",
   tensi/glukosa "estimasi eksperimental".
5. Stop → satu hasil baru di daftar dengan sumber *aplikasi*; baris baru di `device_readings`.
6. Matikan internet, ukur lagi → hasil *menunggu kirim*, **tanpa** HAPUS di log, tetap di alat.
   Nyalakan internet, putus & sambung ulang → hasil itu terkirim dan di-HAPUS, tanpa duplikat.
7. Matikan jam saat tersambung → notifikasi "TeleBand terputus", beranda kembali simulasi.

**Belum ada:** tampilan hasil TeleBand untuk dokter (RLS-nya sudah mengizinkan lawan bicara
konsultasi membaca) dan antarmuka `SET_KALIBRASI` (perintahnya sudah ada di `TC.TeleBand.perintah`).

### Perangkat BLE generik — pembacaan GATT standar

[app/js/ble.js](app/js/ble.js) membaca karakteristik standar Bluetooth SIG:

| Service | Karakteristik | Yang dibaca |
| --- | --- | --- |
| `0x180D` Heart Rate | `0x2A37` | detak jantung, interval RR, status kontak kulit |
| `0x180F` Battery | `0x2A19` | baterai |
| `0x1809` Health Thermometer | `0x2A1C` | suhu (Celsius atau Fahrenheit) |
| `0x1810` Blood Pressure | `0x2A35` | sistol, diastol, MAP, denyut nadi |
| `0x1822` Pulse Oximeter | `0x2A5F` | SpO₂ dan denyut nadi |

Service yang tidak dimiliki perangkat dilewati. HRV dihitung sebagai **RMSSD** dari interval RR.
Suhu dan tekanan darah memakai `FLOAT`/`SFLOAT` **IEEE-11073**; pola khusus (`NaN`, `NRes`,
±`INFINITY`) dikembalikan sebagai `null`.

Saat perangkat tersambung, `Vitals.ingest()` mengambil alih dan simulasi berhenti menimpa angka;
saat lepas, `Vitals.releaseDevice()` mengembalikannya ke simulasi. Web Bluetooth hanya ada di
peramban berbasis Chromium pada origin aman.

### Kalibrasi sensor (admin platform)

`#/sistem/kalibrasi`: `nilai = mentah * gain + offset` per jenis perangkat dan per parameter, dijepit
ke rentang fisiologis, dengan penghitung dua titik. Diterapkan **hanya** pada `Vitals.ingest()`
(nilai sensor sungguhan). Berbeda dari **Profil → Kalibrasi** yang dipakai pasien untuk tekanan darah.

### Detail pasien untuk dokter

`/klinik/pasien/:id` menampilkan vital, stres, tren 7 hari, perangkat, riwayat konsultasi, dan
catatan klinis. Catatan klinis (`TC.Notes`) tambah-saja per butir, tersimpan di `localStorage`
perangkat itu saja. Layar yang sama dipakai admin faskes (`/faskes/anggota/:id`) dengan catatan
baca saja.

### PWA

`app/manifest.webmanifest` membuat aplikasi dapat dipasang; `app/sw.js` menyimpan kerangka
aplikasi sehingga tetap terbuka tanpa jaringan. Kode aplikasi sendiri diambil **jaringan lebih
dulu** (tanpa langkah build, nama berkas tidak memuat sidik isi); aset lain *stale-while-revalidate*.
Permintaan ke `supabase.co` tidak pernah disimpan. SDK Supabase (jsdelivr) tidak ikut di-cache,
jadi saat luring aplikasi berjalan dalam mode lokal.

### Catatan keamanan

- **Anon key Supabase** di [app/js/supabase-init.js](app/js/supabase-init.js) memang publik;
  keamanan bertumpu sepenuhnya pada **Row Level Security** di setiap tabel.
- **Skema dan kebijakan RLS belum dilacak di repo** (kecuali migrasi di `supabase/migrations/`).
  Kebijakan minimum yang diharapkan kode:
  - `consult_members`: pengguna hanya boleh menyisipkan/menghapus baris dengan `user_id = auth.uid()`.
  - `consults` / `messages`: baca-tulis hanya untuk anggota percakapan; `messages.uid = auth.uid()`;
    pesan tidak dapat diubah setelah ditulis.
  - `inbox`: baca oleh `to_uid` atau `from_uid`; sisip hanya dengan `from_uid = auth.uid()`.
  - `push_subscriptions`: hanya pemilik `user_id`.
- **Model kepercayaan:** siapa pun yang memegang ID konsultasi boleh bergabung (fitur tautan
  undangan). Karena itu ID dibangkitkan dengan `crypto.getRandomValues` (± 128 bit).
- **Peran belum tepercaya di server** — masih di `localStorage`. `doctor_directory` dan papan jaga
  dapat diklaim akun mana pun; membatasinya memerlukan peran di server (mis. tabel profil yang
  hanya dapat diubah admin, atau custom claims JWT).
- **Kredensial TURN** ter-commit — lihat peringatan di bagian TURN.

### Sisa Firebase

Proyek sudah pindah dari Firebase. Berkas berikut tidak lagi dipakai aplikasi dan dapat dihapus:
`app/js/firebase.js`, `database.rules.json`, `functions/`, `firebase.json`, `.firebaserc`.

**Pengecualian yang masih aktif:** landing page memuat [js/firebase-init.js](js/firebase-init.js),
yang membaca `telecare/live` dari Realtime Database proyek Firebase lama untuk dashboard pratinjau.
Bila node itu tidak terjangkau, dashboard otomatis beralih ke simulasi lokal dan menandainya di
indikator status — jadi situs tetap berfungsi, tetapi tidak pernah menampilkan data langsung.

---

## Aset 3D

Seluruh geometri, material, pencahayaan, dan animasi kamera dihasilkan skrip Python:

```bash
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -noaudio \
  -P blender/build_assets.py -- --root "<path repo>"
```

Menghasilkan `teleband.glb`, `telering.glb`, `telecare-product.mp4` (120 frame, 30 fps, EEVEE),
tiga PNG transparan, dan `og-cover.png` (± 2–5 menit). `--stills-only` melewati render video.

Varian WebP:

```bash
python -c "from PIL import Image; import glob; [Image.open(f).save(f[:-4]+'.webp','WEBP',quality=88,method=6) for f in glob.glob('assets/img/*.png')]"
```

Catatan Blender 5.x: output video berada di balik `image_settings.media_type = 'VIDEO'`, dan
F-curve diakses lewat *slotted Action* (`action.layers[].strips[].channelbag`).

## Video showcase

| berkas | panjang | isi |
| --- | --- | --- |
| `telecare-promo.mp4` | 1 menit 9 detik | sorotan cepat 24 halaman, klip turntable produk |
| `telecare-tutorial.mp4` | 2 menit 41 detik | 40 langkah bernomor, dipecah per peran |

Keduanya 1920x1080, 30 fps, dibangun dalam tiga tahap:

```powershell
python tools/serve.py 8950
powershell -NoProfile -ExecutionPolicy Bypass -File tools\tangkap-layar.ps1        # ± 12 menit
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bangun-video.ps1         # -LewatiKlip, -Video promo|tutorial
powershell -NoProfile -ExecutionPolicy Bypass -File tools\bangun-capcut.ps1 -Bersihkan   # opsional
```

Tangkapan memakai Edge headless dengan profil sementara (`tools/uji-browser.ps1`). Bantalan suara
disintesis ffmpeg (dinormalkan ke -24 LUFS). `capcut-cli` hanya membuat draft; perintah `bundle`
sengaja tidak dipakai karena menuliskan `device_id`/`mac_address` ke draft. Isi `build/` tidak
dilacak Git.
