# TeleCare

**Platform Telemedisin AIoT Terpadu untuk Pencegahan Penyakit Kronis dan Manajemen Gaya Hidup Berbasis Health 5.0**

Situs profil penelitian + aplikasi web — HTML, CSS, dan JavaScript native (tanpa framework, tanpa langkah build).
Seluruh layanan server memakai **Firebase paket Spark (gratis)**.

| Layanan Firebase | Dipakai untuk |
| --- | --- |
| **Hosting** | Situs penelitian (`/`) + aplikasi (`/app/`) |
| **Authentication** | Pasien masuk dengan Google; admin dengan email + kata sandi |
| **Cloud Firestore** | Profil pasien, catatan makanan, hasil ukur TeleBand, daftar admin |
| **AI Logic** (Gemini Developer API) | Deteksi makanan dari foto, "Wawasan TeleCare AI" di Beranda |

- **Memasang dari nol / langkah di Firebase Console:** [PANDUAN-FIREBASE.md](PANDUAN-FIREBASE.md)
- **Repositori:** https://github.com/fpr35/gelang-cerdas
- **Komisaris pembimbing:** Dr. Fuad Anwar, S.Si., M.Si.
- **Tim:** Fajar Jelang Riyadi (M0222027) · Faizal Tri Widiandika (M0222026) · Sholeh Putra Utama (M0222083) — Fisika, FMIPA

> **Melacak progres?** Lihat [MEMORY.md](MEMORY.md) — status per bagian, keputusan teknis
> beserta alasannya, bug yang pernah ditemukan, utang teknis, dan rencana berikutnya.

> Riwayat: sampai Oktober 2026 proyek memakai Vercel + Supabase + metered.ca (dan sebelum
> 21 September 2026, Firebase lama `telecare-id`). Semuanya sudah dicabut; lihat MEMORY.md §3.

---

## Struktur

```
index.html                  situs penelitian (landing page)
app/                        aplikasi TeleCare (SPA, hash routing, PWA)
404.html                    halaman galat, gaya sama
robots.txt / sitemap.xml    metadata pengindeksan
firebase.json / .firebaserc konfigurasi Firebase Hosting + Firestore, ID project
firestore.rules             aturan keamanan database (pengganti RLS)
firestore.indexes.json      indeks gabungan Firestore
css/style.css · css/fx.css · css/neu.css   sistem desain landing page, transisi, neumorfik
js/app.js                   dashboard landing (simulasi berlabel), ticker, reveal
js/three-scenes.js          tiga scene Three.js (hero, viewer produk, holo Health 5.0)
js/transitions.js           overlay transisi, pengungkap bertahap, penghitung angka
blender/build_assets.py     generator aset 3D — sumber tunggal semua model & render
assets/                     model GLB, render, ikon/ilustrasi 3D, video
tools/serve.py              server lokal dengan MIME type yang benar
tools/uji-browser.ps1       pembantu pengujian Edge headless (DOM + tangkapan layar)
tools/cek-deploy.ps1        bandingkan berkas lokal dengan yang tersaji di Firebase Hosting
tools/tangkap-layar.ps1 · bangun-video.ps1 · bangun-capcut.ps1   video showcase
```

## Menjalankan secara lokal

```bash
python tools/serve.py 8899
# buka http://127.0.0.1:8899  (aplikasi: http://127.0.0.1:8899/app/)
```

Harus lewat HTTP server, bukan `file://` — modul ES, pemuatan GLB, service worker, dan Web
Bluetooth memerlukan origin yang sah. Aplikasi lokal tetap memakai project Firebase sungguhan
(`localhost` termasuk *Authorized domains* bawaan).

`python -m http.server` tidak dipakai: di Windows `.js` sering terdaftar sebagai `text/plain`
sehingga peramban menolak mendaftarkan service worker.

### Menguji dengan Firebase Emulator (tanpa menyentuh data sungguhan)

Butuh Firebase CLI dan **Java 21+**. Buat `firebase.json` terpisah (mis. di folder sementara)
yang menunjuk ke `firestore.rules`, lalu:

```bash
firebase emulators:start --only firestore,auth --project demo-telecare
```

Di peramban, buka aplikasi lewat `http://127.0.0.1:...` dan jalankan di konsol
`localStorage.setItem('tc.emulator', '1')` lalu muat ulang — `app/js/firebase-init.js` hanya
menyambung ke emulator di localhost dengan tanda itu. Konfigurasi project `demo-*` (apiKey
bebas) bisa dipakai untuk emulator.

## Deploy

```bash
firebase login          # sekali per komputer
firebase deploy         # Hosting + aturan Firestore + indeks
```

Langkah lengkap untuk pemula (termasuk membuat project, admin, dan AI Logic):
[PANDUAN-FIREBASE.md](PANDUAN-FIREBASE.md). `firebase.json` mengecualikan `blender/`, `tools/`,
`build/`, berkas `.md`, `.py`, `.blend`, log, dan semua berkas/folder berawalan titik.

Setiap kali kerangka aplikasi berubah, naikkan `VERSION` di [app/sw.js](app/sw.js) supaya cache
lama dibuang di perangkat pengguna.

---

## Aplikasi TeleCare (`/app/`)

SPA native, responsif: tab bar di bawah pada layar sempit, sidebar pada layar lebar. Semua berkas
adalah skrip klasik yang berbagi satu namespace `window.TC`; urutan muatnya ditentukan urutan
`<script>` di [app/index.html](app/index.html).

```
app/index.html            shell + sprite ikon SVG
app/css/app.css           sistem desain aplikasi
app/js/firebase-config.js konfigurasi project Firebase + daftar model Gemini   ← diisi per project
app/js/firebase-init.js   memuat Firebase JS SDK 12.10.0 (gstatic) → window.TELECARE_FB
app/js/core.js            util, Store (localStorage, data per akun), router, komponen UI, grafik
app/js/data.js            katalog perangkat, makanan, tujuan gizi, peran
app/js/firebase.js        TC.FB (sesi), TC.ReadingsDB, TC.PatientsDB, TC.DeteksiDB (Gemini)
app/js/ble.js             pembacaan GATT standar (perangkat generik) + parser IEEE-11073
app/js/teleband-ble.js    protokol BLE khusus TeleBand (alat fisik tim)
app/js/engine.js          vital, hub perangkat, riwayat makanan & gizi, hasil ukur, TeleBandLink
app/js/push-config.js     jeda notifikasi lokal
app/js/push.js            ambang eskalasi + notifikasi lokal
app/js/views-*.js         layar: auth, beranda/analisis, catat makanan, profil, TeleBand, admin
app/js/app.js             daftar rute, navigasi per peran, sinkron data pasien, boot
app/sw.js                 service worker (PWA)
```

**Fitur yang disembunyikan** — `TC.FITUR` di [app/js/core.js](app/js/core.js). Kodenya tetap ada;
yang disembunyikan hanya titik masuknya, dan rutenya dialihkan ke beranda.

| Sakelar | Saat `false` |
| --- | --- |
| `daftarAkun` | layar `/daftar` hilang; pasien masuk hanya lewat Google |
| `konsultasi` | konsultasi, chat, panggilan, janji temu hilang. ⚠️ Kodenya (`views-care.js`, `ring*.js`, `Consult` di engine.js) **belum dipindah ke Firebase** — jangan dinyalakan sebelum diport |
| `simulasi` | tidak ada angka buatan: vital "—" tanpa TeleBand |
| `peranAdmin` | peran Admin Platform (data contoh) tidak dapat dipilih |
| `peranDokter` | peran dokter tidak ada (kode dokter belum dipindah ke Firebase) |
| `akunTamu` | tidak ada "Masuk sebagai Tamu" maupun tautan `?demo=` |
| `gantiPeran` | baris "Ganti peran" di Profil tidak tampil |
| `unit` | tanpa unit berkode: admin memantau **semua** pasien (unit belum dipindah ke Firebase) |

### Peran aktif

| Peran | Masuk | Isi |
| --- | --- | --- |
| Pasien (`pasien`) | Google di `/app/#/masuk` | Vital dari TeleBand, catat makanan (+ deteksi foto), target gizi per tujuan, analisis, riwayat, Wawasan AI |
| Admin (`admin-faskes`, tampil "Admin") | email + sandi di **`/app/#/masuk/admin`** (sengaja tanpa tautan) | Dasbor semua pasien: triase dari hasil ukur terakhir, detail pasien (profil, gizi, makanan, hasil ukur), inventaris TeleBand, laporan CSV, hapus data pasien |

Akun admin dibuat di Firebase Console (Authentication → Add user) lalu didaftarkan dengan dokumen
`admins/{UID}` di Firestore — lihat PANDUAN-FIREBASE.md Bagian 5b.

### Data: apa yang lokal, apa yang di server

| Tempat | Isi |
| --- | --- |
| `localStorage` `telecare.app.v1` | akun lokal, sesi, profil/makanan/notifikasi **per akun** (`pemilikData`, `dataAkun`), perangkat, salinan hasil ukur, pengaturan |
| Firestore `patients/{uid}` | nama, email, profil (usia, tinggi, berat, aktivitas, tujuan, target gizi, `diubah`), `last_seen` |
| Firestore `patient_meals/{uid}_{id}` | catatan makanan (tanpa foto) |
| Firestore `device_readings/{uid}_{serial}_{id}_{epoch}` | hasil ukur TeleBand (tidak bisa diubah setelah tersimpan) |
| Firestore `admins/{uid}` | daftar admin (hanya diisi dari Console) |

Nama koleksi dan field meniru tabel Supabase lama (`snake_case`, waktu sebagai teks ISO 8601),
jadi layar membaca data dengan bentuk yang sama.

**Sinkron dua arah** (`sinkronPasien` di app.js): profil & catatan makanan dikirim saat berubah
(dijeda 4 dtk) dan ditarik saat masuk / tab kembali aktif (maks. sekali per 5 menit per akun).
Perangkat tidak mengirim apa pun sebelum tarikan pertama berhasil, supaya profil kosong perangkat
baru tidak menimpa profil di server. Hasil ukur ditarik inkremental (hanya yang lebih baru dari
kursor `kursorHasil`).

### Aturan keamanan ([firestore.rules](firestore.rules))

- Pasien hanya membaca/menulis dokumennya sendiri; ID dokumen memuat uid pemilik.
- Admin (punya `admins/{uid}`) membaca semua pasien, makanan, dan hasil ukur, dan boleh menghapusnya.
- Akun admin tidak bisa mendaftar sebagai pasien; aplikasi tidak bisa membuat admin.
- Hasil ukur tidak bisa diubah setelah tersimpan; bentuk & rentang nilainya divalidasi
  (sama dengan batasan tabel lama, sengaja longgar — lihat komentar di berkasnya).

Diuji dengan Firestore Emulator: 54 kasus (akses sah dan percobaan pelanggaran).

### Notifikasi

Peringatan eskalasi dihitung di perangkat (`TC.Escalation`, [app/js/push.js](app/js/push.js)) dan
ditampilkan sebagai notifikasi sistem. Push dari server **tidak ada** (butuh Cloud Functions/Blaze).

| Ukuran | Waspada | Kritis |
| --- | --- | --- |
| Detak jantung | &gt;110 atau &lt;50 bpm | &gt;130 atau &lt;45 bpm |
| SpO₂ | &lt;94% | &lt;90% |
| Suhu | ≥37,8 °C | ≥39 °C atau ≤35 °C |
| Tekanan darah | ≥140/90 mmHg | ≥180/120 atau sistol &lt;90 mmHg |

> **Bukan alat kesehatan.** Ambang di atas adalah heuristik penyaring untuk purwarupa, bukan
> kriteria diagnostik. Tensi & glukosa TeleBand (estimasi eksperimental) tidak memicu peringatan.

### Deteksi makanan & Wawasan AI (Firebase AI Logic)

`TC.DeteksiDB` memanggil Gemini langsung dari peramban lewat AI Logic (kunci dikelola Firebase,
tidak ada di kode). Daftar model di `TELECARE_AI.models` (firebase-config.js) dicoba berurutan:
model tidak ada (404) → model berikutnya; sibuk/kuota (429/500/503) → ulangi sekali lalu model
berikutnya. Nama makanan dibatasi ke `TC.DATA.FOODS` lewat skema enum, lalu divalidasi ulang
(porsi dibulatkan ke 0,5/1/1,5/2/3, duplikat digabung). Wawasan hanya menerima ringkasan angka
(tanpa nama/email). Foto makanan dikirim ke Google untuk dikenali dan tidak disimpan di server.

### TeleBand — alat fisik (ESP32-C6 + MAX30102)

TeleBand memakai **protokol BLE buatan tim sendiri**, bukan profil Bluetooth SIG, jadi punya jalur
terpisah dari `ble.js`. Kontraknya ada di repo firmware (`docs/PROTOKOL_BLE.md`, `tc_proto.h`),
dengan klien referensi `tools/web-test/index.html`.

| Berkas | Isi |
| --- | --- |
| [app/js/teleband-ble.js](app/js/teleband-ble.js) | `TC.TeleBand`: UUID, parser paket INFO/STATUS/LIVE/HASIL, penyusun perintah, sambungan + antrean tulis GATT |
| [app/js/engine.js](app/js/engine.js) | `TC.TeleBandLink` (alat ↔ Vitals ↔ hub perangkat) dan `TC.Readings` (hasil ukur lokal + server) |
| [app/js/views-teleband.js](app/js/views-teleband.js) | layar `#/teleband`: sambung, ukur, pratinjau LIVE, daftar hasil |

**Alur.** *Sambungkan TeleBand* → pemilih peramban (hanya service `7e1e0001-…`) → baca INFO
(memicu dialog pairing OS) → langgani STATUS, LIVE, HASIL → tulis `SET_WAKTU`. Semua tulisan ke
KONTROL lewat **satu antrean**, karena Web Bluetooth menolak dua operasi GATT bersamaan.

| | Perlakuan |
| --- | --- |
| LIVE (±1 dtk selama mengukur) | Pratinjau; angka `sementara` redup. Hanya angka stabil yang masuk `Vitals`. Tidak disimpan. |
| HASIL (satu per sesi ukur) | Disimpan: salinan lokal + `device_readings`. |
| HAPUS ke alat | Dikirim **hanya setelah server mengonfirmasi** (luring → batas waktu 15 dtk → tetap di alat). |
| Dedup | `serial + id + epoch` — juga ID dokumen Firestore. |
| Glukosa & tensi | Estimasi **eksperimental**: disimpan, selalu berlabel, tidak untuk eskalasi. |

**Syarat:** Chrome/Edge di desktop atau Android, lewat HTTPS atau `localhost`. iOS tidak didukung
(tidak ada Web Bluetooth). **Belum ada:** antarmuka `SET_KALIBRASI` (perintahnya sudah ada di
`TC.TeleBand.perintah`).

### Perangkat BLE generik

[app/js/ble.js](app/js/ble.js) membaca karakteristik standar Bluetooth SIG (Heart Rate `0x180D`,
Battery `0x180F`, Health Thermometer `0x1809`, Blood Pressure `0x1810`, Pulse Oximeter `0x1822`)
dengan `FLOAT`/`SFLOAT` IEEE-11073. Jalur ini tidak lagi ditawarkan di layar (hanya TeleBand).

### PWA

`app/manifest.webmanifest` membuat aplikasi dapat dipasang; `app/sw.js` menyimpan kerangka
aplikasi dan Firebase SDK (versi dikunci) sehingga tetap terbuka tanpa jaringan. Kode aplikasi
diambil **jaringan lebih dulu**; aset lain *stale-while-revalidate*. Permintaan ke Firestore,
Auth, dan AI Logic tidak pernah di-cache.

### Catatan keamanan

- `apiKey` dan konfigurasi Firebase di [app/js/firebase-config.js](app/js/firebase-config.js)
  memang publik; keamanan data bertumpu pada [firestore.rules](firestore.rules).
- AI Logic tanpa App Check: siapa pun yang tahu konfigurasi project bisa memakai kuota Gemini
  gratisnya (tidak ada biaya; kuota bisa habis). App Check dapat ditambahkan kelak.
- Peran pasien/admin ditentukan server lewat `admins/{uid}`; `user.role` di localStorage hanya
  penjaga tampilan.

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

Tangkapan memakai Edge headless dengan profil sementara (`tools/uji-browser.ps1`). Isi `build/`
tidak dilacak Git. Hosting gratis Firebase membatasi transfer 360 MB/hari — video di bagian
landing yang tersembunyi memakai `preload="none"` sehingga tidak ikut terunduh.
