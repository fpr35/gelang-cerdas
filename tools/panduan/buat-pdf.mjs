// ============================================================
// TeleCare — mencetak panduan ke PDF (A4) lewat Edge headless (CDP, port 9333).
//   panduan/index.html        → panduan/panduan-telecare.pdf   (publik)
//   docs/panduan-admin.html   → build/Panduan-Admin-TeleCare.pdf (bagikan langsung ke admin)
// Dijalankan oleh tools/buat-panduan.ps1.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const DOKUMEN = [
  { url: 'http://127.0.0.1:8951/panduan/', keluar: 'panduan/panduan-telecare.pdf', judul: 'TeleCare · Panduan Penggunaan' },
  { url: 'http://127.0.0.1:8951/docs/panduan-admin.html', keluar: 'build/Panduan-Admin-TeleCare.pdf', judul: 'TeleCare · Panduan Admin (terbatas)' }
];

const hal = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((x) => x.type === 'page');
const ws = new WebSocket(hal.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0; const tunggu = {};
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && tunggu[m.id]) { tunggu[m.id](m); delete tunggu[m.id]; } });
const k = (method, params) => new Promise((r) => { const id = ++n; tunggu[id] = r; ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await k('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result.result.value;

await k('Runtime.enable'); await k('Page.enable');
await k('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });

for (const d of DOKUMEN) {
  await k('Page.navigate', { url: d.url });
  await tidur(1500);
  // Semua gambar dimuat (lazy tidak termuat saat mencetak), lalu tunggu font.
  const status = await ev(`(async () => {
    const imgs = [...document.images];
    imgs.forEach((i) => { i.loading = 'eager'; });
    await Promise.all(imgs.map((i) => i.complete && i.naturalWidth ? null : new Promise((r) => { i.onload = i.onerror = r; })));
    await document.fonts.ready;
    return { gambar: imgs.length, rusak: imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')) };
  })()`);
  if (status.rusak.length) { console.error('Gambar gagal dimuat di', d.url, status.rusak); process.exit(1); }
  const r = await k('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:8px;color:#6B7C93;width:100%;padding:0 14mm;display:flex;justify-content:space-between">
      <span>${d.judul}</span><span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>`
  });
  if (!r.result || !r.result.data) { console.error('Gagal mencetak', d.url, JSON.stringify(r.error || r)); process.exit(1); }
  const tujuan = path.join(AKAR, d.keluar);
  fs.mkdirSync(path.dirname(tujuan), { recursive: true });
  fs.writeFileSync(tujuan, Buffer.from(r.result.data, 'base64'));
  const halaman = (Buffer.from(r.result.data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('  ✓', d.keluar, Math.round(fs.statSync(tujuan).size / 1024) + ' KB,', halaman, 'halaman,', status.gambar, 'gambar');
}
ws.close();
process.exit(0);
