// ============================================================
// TeleCare — tangkapan layar untuk panduan penggunaan.
//
// Membuka aplikasi di Edge headless (lewat CDP, port 9333) dengan DATA
// CONTOH (nama fiktif) dan Firebase DIBLOKIR, lalu menyimpan gambar:
//   panduan/img/p*.jpg    layar pasien (publik)
//   docs/img/a*.jpg       layar admin  (TIDAK ditayangkan)
// Dijalankan oleh tools/buat-panduan.ps1 — jangan dijalankan sendiri
// tanpa Edge yang memblokir www.gstatic.com & *.googleapis.com Firebase.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = 'http://127.0.0.1:8951/app/';
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const HARI = 86400000;

const hal = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((x) => x.type === 'page');
const ws = new WebSocket(hal.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const tunggu = {}; const galat = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && tunggu[m.id]) { tunggu[m.id](m); delete tunggu[m.id]; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails; galat.push((d.exception && d.exception.description) || d.text);
  }
});
const k = (method, params) => new Promise((r) => { const id = ++n; tunggu[id] = r; ws.send(JSON.stringify({ id, method, params })); });
async function ev(expr) {
  const r = await k('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result.result.value;
}
async function ukuran(lebar, tinggi, hp) {
  await k('Emulation.setDeviceMetricsOverride', { width: lebar, height: tinggi, deviceScaleFactor: 2, mobile: hp });
}
async function ke(hash, jeda) {
  await ev(`(location.hash = ${JSON.stringify(hash)}, true)`);
  await tidur(jeda || 1100);
}
async function gulir(selektor) {
  if (selektor) await ev(`(() => { const el = document.querySelector(${JSON.stringify(selektor)}); if (el) el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); return true; })()`);
  else await ev('(window.scrollTo(0, 0), true)');
  await tidur(400);
}
async function simpan(berkas) {
  const r = await k('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  const tujuan = path.join(AKAR, berkas);
  fs.mkdirSync(path.dirname(tujuan), { recursive: true });
  fs.writeFileSync(tujuan, Buffer.from(r.result.data, 'base64'));
  console.log('  ✓', berkas, Math.round(fs.statSync(tujuan).size / 1024) + ' KB');
}

await k('Runtime.enable'); await k('Page.enable');
await k('Network.enable'); await k('Network.setBypassServiceWorker', { bypass: true });
// Peramban bersih: tanpa sisa data sesi pengambilan sebelumnya.
await k('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:8951', storageTypes: 'all' });

/* ==================== PASIEN (HP 390 × 844) ==================== */
console.log('Layar pasien:');
await ukuran(390, 844, true);
await k('Page.navigate', { url: APP }); await tidur(3500);
await ev('(TC.Store.update((s) => { s.onboarded = true; s.dataNyataV1 = 1; }), true)');
await ke('/masuk'); await gulir(); await simpan('panduan/img/p01-masuk.jpg');

// Akun contoh (lokal, tanpa Firebase). Nama fiktif.
await ev(`(() => {
  TC.Store.update((s) => { s.users.u1 = { id: 'u1', name: 'Rina Putri', email: 'rina.contoh@gmail.com', phone: '', role: 'pasien', provider: 'google', nickname: 'Rina' }; });
  TC.Store.masuk('u1');
  TC.Store.update((s) => { Object.assign(s.profile, { nickname: 'Rina', gender: 'perempuan', age: 29, height: 158, weight: 60,
    aktivitas: 'ringan', goal: 'turun-berat', diubah: Date.now() }); TC.Gizi.terapkan(s.profile, true); s.settings.notif = false; });
  return true; })()`);
await ke('/lengkapi'); await gulir(); await simpan('panduan/img/p02-lengkapi.jpg');

// Riwayat contoh: makanan & hasil ukur 7 hari.
await ev(`(() => {
  const H = ${HARI}, now = Date.now(), jam = (h, m) => { const d = new Date(); d.setHours(h, m || 0, 0, 0); return d.getTime(); };
  const catat = (items, t) => TC.Meals.catat(items.map(([n, q]) => ({ n, qty: q, g: Math.round(TC.DATA.food(n).g * q) })), null, t);
  for (let i = 6; i >= 1; i--) {
    catat([['Nasi merah', 1], ['Ayam panggang', 1], ['Sayur bayam', 1]], jam(12, 15) - i * H);
    catat([['Roti tawar', 2], ['Telur dadar', 1], ['Kopi hitam', 1]], jam(7, 10) - i * H);
  }
  catat([['Roti tawar', 2], ['Telur dadar', 1], ['Kopi hitam', 1]], jam(7, 5));
  catat([['Nasi merah', 1], ['Ikan bakar', 1], ['Tumis buncis', 1], ['Air putih', 1]], Math.min(jam(12, 30), now - 60000));
  const bacaan = [];
  const serial = 'A1B2C3D4E5F6';
  const nilai = [[78, 97], [74, 98], [81, 97], [76, 98], [72, 97], [79, 96], [75, 98]];
  nilai.forEach(([bpm, spo2], i) => {
    const t = now - (6 - i) * H - 3600000 * 2;
    const ep = Math.floor(t / 1000);
    bacaan.push({ kunci: serial + ':' + (i + 1) + ':' + ep, pemilik: 'u1', serial, unit: 7, firmware: '1.2', idAlat: i + 1, epoch: ep,
      waktuValid: true, waktu: t, durasi: 45, bpm, spo2, glukosa: 96 + i, sis: 112 + i, dia: 74, sumber: i % 2 ? 'tombol' : 'web',
      flag: 79, diterima: t + 5000, tersinkron: true, galat: null });
  });
  TC.Store.update((s) => {
    s.readings = bacaan;
    s.devices = [{ id: 'dev-tb', type: 'teleband', name: 'TeleCare-07', code: serial, battery: 82, connected: true, real: true,
      pairedAt: now - 5 * H, lastSync: now - 600000, rssi: 4, firmware: '1.2', unit: 7 }];
    s.activeDeviceId = 'dev-tb';
    s.notifications = [];
  });
  return true; })()`);

// TeleBand tiruan: tersambung, status & pratinjau LIVE bisa diatur.
await ev(`(() => {
  const L = TC.TeleBandLink;
  window.__tb = { on: false, mengukur: false, cukup: false, sementara: false };
  TC.TeleBand.supported = () => true;
  L.tersambung = () => __tb.on; L.menyambung = () => false;
  L.nama = () => 'TeleCare-07'; L.info = () => ({ serial: 'A1B2C3D4E5F6', firmware: '1.2', unit: 7 });
  L.status = () => (__tb.on ? { baterai: 82, mengisi: false, tersimpan: 0, jamTersetel: true, mengukur: __tb.mengukur, stateTeks: 'stabil' } : null);
  L.live = () => (__tb.on && __tb.mengukur ? { bpm: 76, spo2: 97, glukosa: 101, sis: 116, dia: 75, durasi: __tb.cukup ? 46 : 18,
    kemajuan: __tb.cukup ? 100 : 45, cukup: __tb.cukup, sementara: __tb.sementara, state: __tb.sementara ? 3 : 4,
    stateTeks: __tb.sementara ? 'mencari detak' : 'stabil' } : null);
  L.log = () => [];
  return true; })()`);

// Beranda dengan angka dari TeleBand.
await ev(`(() => { window.__tb.on = true;
  TC.Vitals.ingest({ hr: 76, spo2: 97, sys: 116, dia: 75, glucose: 101 }, 'teleband', { eksperimental: TC.TeleBandLink.EKSPERIMENTAL });
  return true; })()`);
await ke('/home', 1600); await gulir(); await simpan('panduan/img/p03-beranda.jpg');
await gulir('[data-ekg]'); await simpan('panduan/img/p04-beranda-bawah.jpg');

// Sambungkan: layar pindai & layar TeleBand belum tersambung.
await ev(`(() => { window.__tb.on = false; TC.Vitals.releaseDevice();
  TC.Store.update((s) => { s.devices[0].connected = false; }); return true; })()`);
await ke('/perangkat/pindai'); await gulir(); await simpan('panduan/img/p05-pindai.jpg');
await ke('/teleband'); await gulir(); await simpan('panduan/img/p06-teleband-sambung.jpg');

// Tersambung → mengukur (angka sementara) → data cukup.
await ev(`(() => { window.__tb.on = true; TC.Store.update((s) => { s.devices[0].connected = true; }); TC.Router.render(); return true; })()`);
await tidur(700); await gulir(); await simpan('panduan/img/p07-teleband-siap.jpg');
await ev(`(() => { Object.assign(window.__tb, { mengukur: true, sementara: true }); TC.Router.render(); return true; })()`);
await tidur(700); await gulir('#tbLive'); await simpan('panduan/img/p08-teleband-mengukur.jpg');
await ev(`(() => { Object.assign(window.__tb, { mengukur: true, sementara: false, cukup: true }); TC.Router.render(); return true; })()`);
await tidur(700); await gulir('#tbLive'); await simpan('panduan/img/p09-teleband-cukup.jpg');
await ev(`(() => { Object.assign(window.__tb, { mengukur: false, cukup: false }); TC.Router.render(); return true; })()`);
await tidur(700); await gulir('#tbHasil'); await simpan('panduan/img/p10-teleband-hasil.jpg');

// Catat makanan: hasil deteksi foto (usulan AI) siap disimpan.
await ev(`(() => { sessionStorage.setItem('tc.draft', JSON.stringify({
  items: [{ n: 'Nasi putih', qty: 1, g: 120 }, { n: 'Ayam goreng', qty: 1, g: 110 }, { n: 'Sambal', qty: 1, g: 15 }],
  confidence: 87, photo: null, ai: { lainnya: ['Lalapan'], bukanMakanan: false } })); return true; })()`);
await ke('/sesi/hasil'); await gulir(); await simpan('panduan/img/p11-catat.jpg');
await gulir('.nutri6'); await simpan('panduan/img/p12-catat-penilaian.jpg');

const idMakan = await ev('TC.Store.state.meals[0].id');
await ke('/sesi/' + idMakan); await gulir(); await simpan('panduan/img/p13-rincian.jpg');

await ke('/analisis?tab=vital', 1500); await gulir(); await simpan('panduan/img/p14-analisis.jpg');
await ke('/riwayat'); await gulir(); await simpan('panduan/img/p15-riwayat.jpg');
await ev(`(() => { document.querySelector('[data-h=sync]').click(); return true; })()`); await tidur(500);
await gulir(); await simpan('panduan/img/p16-riwayat-hasil.jpg');
await ke('/profil'); await gulir(); await simpan('panduan/img/p17-profil.jpg');
await ke('/profil/tujuan'); await gulir(); await simpan('panduan/img/p18-tujuan.jpg');
await gulir('.section-title:nth-of-type(2)'); await simpan('panduan/img/p19-tujuan-dasar.jpg');
await ke('/profil/pengaturan'); await gulir(); await simpan('panduan/img/p20-pengaturan.jpg');
await ke('/vital/hr'); await gulir(); await simpan('panduan/img/p21-detail-vital.jpg');

/* ==================== ADMIN (desktop 1280 × 800) ==================== */
console.log('Layar admin:');
await ev(`(() => { TC.Store.update((s) => { s.session = null; }); return true; })()`);
await ukuran(1280, 800, false);
await ke('/masuk/admin'); await gulir(); await simpan('docs/img/a01-masuk-admin.jpg');

// Data server tiruan untuk dasbor admin (nama fiktif).
await ev(`(() => {
  const H = ${HARI}, now = Date.now(), iso = (t) => new Date(t).toISOString();
  const pasien = [
    { user_id: 'p1', name: 'Rina Putri', email: 'rina.contoh@gmail.com', last: 0.1, prof: { gender: 'perempuan', age: 29, height: 158, weight: 60, aktivitas: 'ringan', goal: 'turun-berat' }, bacaan: [[76, 97], [74, 98], [79, 96]] },
    { user_id: 'p2', name: 'Andi Saputra', email: 'andi.contoh@gmail.com', last: 0.3, prof: { gender: 'laki-laki', age: 35, height: 170, weight: 82, aktivitas: 'sedang', goal: 'gula-stabil' }, bacaan: [[114, 95], [108, 96]] },
    { user_id: 'p3', name: 'Siti Rahma', email: 'siti.contoh@gmail.com', last: 1.2, prof: { gender: 'perempuan', age: 62, height: 152, weight: 55, aktivitas: 'sedentari', goal: 'jaga-berat' }, bacaan: [[88, 89], [92, 91]] },
    { user_id: 'p4', name: 'Bayu Pratama', email: 'bayu.contoh@gmail.com', last: 2.5, prof: { gender: 'laki-laki', age: 22, height: 175, weight: 63, aktivitas: 'berat', goal: 'bulking' }, bacaan: [] }
  ];
  const rows = [], baris = [];
  pasien.forEach((p, ip) => {
    const prof = Object.assign({ targetManual: false, nickname: p.name.split(' ')[0] }, p.prof);
    prof.targets = TC.Gizi.targetUntuk(prof, prof.goal);
    baris.push({ user_id: p.user_id, name: p.name, email: p.email, anonymous: false, created_at: iso(now - (20 + ip) * H),
      last_seen: iso(now - p.last * H), profile: prof, sesi_berjalan: null });
    p.bacaan.forEach(([bpm, spo2], i) => {
      const t = now - (i * 1.4 + ip * 0.2 + 0.05) * H;
      rows.push({ user_id: p.user_id, device_serial: 'A1B2C3D4E5F' + ip, device_unit: ip + 5, firmware: '1.2', device_result_id: i + 1,
        device_epoch: Math.floor(t / 1000), measured_at: iso(t), time_valid: true, duration_s: 45, bpm, spo2,
        glucose_est: 98 + i, sys_est: 118 + i, dia_est: 76, source: 'web', flags: 79, received_at: iso(t + 4000) });
    });
  });
  const makan = [
    { id: 'm1', v: 3, at: now - 3 * 3600000, kind: 'Makan Siang', items: [{ n: 'Nasi merah', qty: 1, g: 120 }, { n: 'Ikan bakar', qty: 1, g: 130 }, { n: 'Tumis buncis', qty: 1, g: 90 }], status: 'done', adaFoto: true },
    { id: 'm2', v: 3, at: now - 8 * 3600000, kind: 'Sarapan', items: [{ n: 'Roti tawar', qty: 2, g: 60 }, { n: 'Telur dadar', qty: 1, g: 60 }], status: 'done', adaFoto: false }
  ];
  makan.forEach((m) => { m.nutrition = TC.Meals.nutrition(m.items); });
  window.__admin = { baris, rows, makan };
  TC.PatientsDB = {
    semua: async () => __admin.baris.slice(), satu: async (id) => __admin.baris.find((b) => b.user_id === id) || null,
    sesi: async (id) => (id === 'p1' ? __admin.makan.slice() : []), hapusData: async () => true,
    daftarkan: async () => true, simpanSesi: async () => true, hapusSesi: async () => true
  };
  TC.ReadingsDB = {
    terbaru: async () => __admin.rows.slice(), daftar: async (id) => __admin.rows.filter((r) => r.user_id === id),
    daftarBanyak: async (ids) => __admin.rows.filter((r) => ids.indexOf(r.user_id) !== -1), simpan: async () => true
  };
  TC.Store.update((s) => { s.users.u2 = { id: 'u2', name: 'Admin Puskesmas', nickname: 'Admin', email: 'admin@contoh.id', phone: '',
    role: 'admin-faskes', adminUid: 'A1', provider: 'admin' }; });
  TC.Store.masuk('u2');
  return true; })()`);
await ke('/faskes', 1600); await gulir(); await simpan('docs/img/a02-ringkasan.jpg');
await gulir('.section-title'); await simpan('docs/img/a03-ringkasan-bawah.jpg');
await ke('/faskes/anggota', 1400); await gulir(); await simpan('docs/img/a04-pengguna.jpg');
await ke('/faskes/anggota/p1', 1600); await gulir(); await simpan('docs/img/a05-detail.jpg');
await gulir('.vital-grid'); await simpan('docs/img/a06-detail-hasil.jpg');
await ke('/faskes/perangkat', 1400); await gulir(); await simpan('docs/img/a07-perangkat.jpg');

console.log('Exception di halaman:', galat.length ? galat : 'tidak ada');
ws.close();
process.exit(galat.length ? 1 : 0);
