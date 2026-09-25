/* ============================================================
   TeleCare App — views-teleband.js
   Layar alat TeleBand sungguhan: sambung, ukur (pratinjau LIVE),
   hasil tersimpan (HASIL) beserta status sinkronnya ke server.

   Angka glukosa dan tensi dari alat ini adalah estimasi eksperimental
   menurut firmware-nya sendiri. Setiap tempat yang menampilkannya wajib
   memberi tanda * dan keterangan "bukan alat medis".
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, esc, icon, Store, Router, setView, toast, confirmSheet, hhmm, shortDate, relTime } = TC;

  const TANDA = '<sup class="tb-eks" title="Estimasi eksperimental, bukan alat medis">*</sup>';

  function angka(v, satuan, sementara) {
    if (v == null) return '<b class="tb-val">—</b>';
    return `<b class="tb-val${sementara ? ' is-sementara' : ''}">${esc(v)}<u>${esc(satuan)}</u></b>`;
  }

  function waktuHasil(x) {
    if (x.waktu) return esc(shortDate(new Date(x.waktu)) + ' · ' + hhmm(new Date(x.waktu)));
    // Jam alat belum tersetel saat mengukur: waktu mulai tidak diketahui.
    return 'waktu alat tidak tersetel · diterima ' + esc(relTime(x.diterima));
  }

  function viewTeleband() {
    const L = TC.TeleBandLink;
    TC.topbar('TeleBand', { sub: 'Alat fisik · Bluetooth' });

    if (!TC.TeleBand.supported()) {
      setView(`
        <div class="empty">${icon('bt')}<b>Web Bluetooth tidak tersedia</b>
          <p>TeleBand hanya dapat disambungkan dari <b>Chrome atau Edge</b> di desktop maupun
          Android, lewat HTTPS. Safari di iPhone/iPad tidak mendukung Web Bluetooth sama sekali.</p></div>
        ${daftarHasilHtml()}`);
      return;
    }

    let tersambungTadi = null;

    function draw() {
      tersambungTadi = L.tersambung();
      const on = tersambungTadi;
      const info = L.info();

      setView(`
        <div class="card">
          <div class="dev-head">
            <span class="dev-card__ico" style="${on ? 'background:var(--green-100);color:var(--green-600)' : ''}">
              ${icon(on ? 'watch' : 'bt')}</span>
            <div class="dev-head__txt">
              <b style="font-size:.98rem">${on ? esc(L.nama()) : 'TeleBand belum tersambung'}</b>
              <small class="muted" style="font-size:.8rem">${on && info
                ? 'serial ' + esc(info.serial) + ' · firmware ' + esc(info.firmware)
                : 'ESP32-C6 + MAX30102 · pengukuran lewat jari'}</small>
            </div>
            <span class="chip ${on ? 'chip--g' : ''}" style="margin-left:auto">
              ${on ? '<i class="dotlive"></i> tersambung' : 'terputus'}</span>
          </div>

          ${on ? `<div id="tbStatus" class="mt"></div>
            <div class="duo mt">
              <button class="btn btn--ghost btn--sm btn--block" data-sinkron>${icon('sync')} Sinkron</button>
              <button class="btn btn--ghost btn--sm btn--block" data-putus>Putuskan</button>
            </div>` : `
            <button class="btn btn--primary btn--block mt" data-sambung>${icon('bt')}
              ${L.menyambung() ? 'Menyambungkan…' : 'Sambungkan TeleBand'}</button>
            <p class="tiny muted mt">Nyalakan jam, lalu pilih <b>TeleCare-…</b> di daftar peramban.
              Saat pertama kali, sistem operasi akan meminta <b>pairing</b> — itu memang diharapkan,
              setujui saja.</p>`}
        </div>

        ${on ? `
          <div class="card mt">
            <div class="card__head">${icon('heart')}<h3>Pengukuran</h3>
              <span class="push"></span><span id="tbState" class="chip"></span></div>
            <div id="tbLive"></div>
            <div class="duo mt">
              <button class="btn btn--primary btn--block" data-mulai>${icon('heart')} Mulai ukur</button>
              <button class="btn btn--ghost btn--block" data-stop>Stop ukur</button>
            </div>
            <p class="tiny muted mt" id="tbPetunjuk"></p>
          </div>` : ''}

        <div class="note note--w mt">${icon('alert')}
          <div><b>Tensi dan glukosa${TANDA} hanya estimasi eksperimental</b>
          Firmware TeleBand sendiri menyatakan modelnya belum punya dasar ilmiah yang kuat.
          Detak jantung dan SpO₂ diukur langsung lewat PPG. Alat ini tidak mengukur suhu${
            TC.FITUR.simulasi ? ' — suhu di beranda tetap simulasi' : ''}. Bukan alat medis.</div></div>

        <div id="tbHasil">${daftarHasilHtml()}</div>

        ${on ? `
          <details class="card mt">
            <summary class="small" style="cursor:pointer;font-weight:700">Lanjutan</summary>
            <button class="btn btn--dangerSoft btn--block mt" data-hapus-semua>
              ${icon('trash')} Hapus semua hasil di alat</button>
            <pre id="tbLog" class="mono tiny mt" style="white-space:pre-wrap;max-height:220px;overflow:auto;
              background:var(--canvas);border-radius:12px;padding:10px"></pre>
          </details>` : ''}
      `);

      bind();
      paint();
    }

    function daftarHasilHtml() {
      const list = TC.Readings.list();
      const tertunda = TC.Readings.belumTerkirim();
      return `
        <div class="section-title">${icon('doc')} Hasil pengukuran
          <span class="push"></span><span class="chip">${list.length}</span></div>
        ${tertunda ? `<div class="note note--i">${icon('info')}
          <div><b>${tertunda} hasil belum sampai ke server</b>Hasil itu tetap tersimpan di alat dan
          di peramban ini, dan akan dikirim ulang otomatis saat TeleBand tersambung lagi.
          <button class="btn btn--soft btn--sm mt" data-kirim-ulang>${icon('sync')} Kirim sekarang</button></div></div>` : ''}
        ${list.length ? `<div class="stack--sm stack">${list.slice(0, 50).map((x) => `
          <div class="card card--flat">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <b class="small">${waktuHasil(x)}</b>
              <span class="push" style="margin-left:auto"></span>
              ${x.tersinkron
                ? `<span class="chip chip--g" style="font-size:.64rem">${icon('check')} di server</span>`
                : `<span class="chip chip--a" style="font-size:.64rem" title="${esc(x.galat || '')}">menunggu kirim</span>`}
            </div>
            <div class="vital-mini" style="margin-top:9px">
              <div><span>Detak jantung</span><b>${x.bpm != null ? esc(x.bpm) + ' bpm' : '—'}</b></div>
              <div><span>SpO₂</span><b>${x.spo2 != null ? esc(x.spo2) + '%' : '—'}</b></div>
              <div><span>Tensi${TANDA}</span><b>${x.sis != null && x.dia != null ? esc(x.sis) + '/' + esc(x.dia) : '—'}</b></div>
              <div><span>Glukosa${TANDA}</span><b>${x.glukosa != null ? esc(x.glukosa) + ' mg/dL' : '—'}</b></div>
            </div>
            <p class="tiny muted" style="margin-top:7px">${esc(x.durasi)} dtk · dimulai dari
              ${x.sumber === 'web' ? 'aplikasi' : 'tombol di jam'} · unit ${esc(x.serial.slice(-6))} · id ${esc(x.idAlat)}</p>
          </div>`).join('')}</div>
          <p class="tiny muted mt">${TANDA} estimasi eksperimental, bukan alat medis.</p>` : `
          <div class="empty" style="padding:22px 10px">${icon('heart')}<b>Belum ada hasil</b>
            <p>Sambungkan TeleBand lalu tekan Mulai ukur. Hasil yang diukur lewat tombol di jam
            juga ikut terkirim saat tersambung.</p></div>`}`;
    }

    /** Pembaruan bagian yang sering berubah, tanpa menggambar ulang tombol. */
    function paint() {
      if (L.tersambung() !== tersambungTadi) { draw(); return; }
      const s = L.status();
      const l = L.live();

      const st = $('#tbStatus');
      if (st) {
        st.innerHTML = s ? `<div class="stat-row">
          <div><b>${s.baterai != null ? esc(s.baterai) + '%' : '—'}${s.mengisi ? ' ⚡' : ''}</b><span>Baterai</span></div>
          <div><b>${esc(s.tersimpan)}</b><span>Hasil di alat</span></div>
          <div><b>${s.jamTersetel ? 'OK' : 'belum'}</b><span>Jam alat</span></div>
        </div>` : '<p class="tiny muted">Menunggu status alat…</p>';
      }

      const mengukur = !!(s && s.mengukur);
      const stateEl = $('#tbState');
      if (stateEl) {
        stateEl.className = 'chip ' + (mengukur ? 'chip--g' : '');
        stateEl.innerHTML = mengukur
          ? '<i class="dotlive"></i> ' + esc((l && !l.berhenti ? l.stateTeks : (s && s.stateTeks)) || 'mengukur')
          : 'siap';
      }

      const liveEl = $('#tbLive');
      if (liveEl) {
        const tampil = l && (mengukur || l.berhenti);
        const sem = !!(l && l.sementara && !l.berhenti);
        const kemajuan = tampil ? l.kemajuan : 0;
        liveEl.innerHTML = `
          <div class="tiny muted" style="display:flex;justify-content:space-between">
            <span>Kemajuan${l && l.cukup ? ' · <b style="color:var(--green-600)">data cukup</b>' : ''}</span>
            <span class="mono">${tampil ? esc(l.durasi) + ' dtk' : ''}</span></div>
          <div class="bar" style="margin:6px 0 12px"><i style="width:${kemajuan}%"></i></div>
          <div class="tb-grid">
            <div><span>Detak jantung</span>${angka(tampil ? l.bpm : null, 'bpm', sem)}</div>
            <div><span>SpO₂</span>${angka(tampil ? l.spo2 : null, '%', sem)}</div>
            <div><span>Tensi${TANDA}</span>${angka(tampil && l.sis != null && l.dia != null ? l.sis + '/' + l.dia : null, 'mmHg', sem)}</div>
            <div><span>Glukosa${TANDA}</span>${angka(tampil ? l.glukosa : null, 'mg/dL', sem)}</div>
          </div>
          ${l && l.berhenti ? '<p class="tiny muted mt">Angka terakhir sebelum pengukuran dihentikan. Hasil resminya ada di daftar di bawah.</p>' : ''}`;
      }

      const mulai = $('[data-mulai]'), stop = $('[data-stop]');
      if (mulai) mulai.disabled = mengukur;
      if (stop) {
        stop.disabled = !mengukur;
        const cukup = !!(l && l.cukup && mengukur);
        stop.className = 'btn btn--block ' + (cukup ? 'btn--primary' : 'btn--ghost');
        stop.innerHTML = cukup ? icon('check') + ' Data cukup — stop' : 'Stop ukur';
      }
      const pet = $('#tbPetunjuk');
      if (pet) {
        pet.textContent = !mengukur
          ? 'Tekan Mulai ukur, lalu tempelkan ujung jari pada sensor dan tahan diam.'
          : (l && l.state === 1 ? 'Tempelkan ujung jari pada sensor.'
            : l && l.state === 5 ? 'Sensor tidak terdeteksi di alat — periksa perangkat kerasnya.'
            : l && l.cukup ? 'Data sudah cukup. Tekan stop untuk menyimpan hasil.'
            : 'Tahan jari tetap diam sampai kemajuan penuh.');
      }

      const hasilEl = $('#tbHasil');
      if (hasilEl) {
        const n = TC.Readings.list().length + ':' + TC.Readings.belumTerkirim();
        if (hasilEl.dataset.n !== n) {
          hasilEl.dataset.n = n;
          hasilEl.innerHTML = daftarHasilHtml();
          bindHasil();
        }
      }

      const logEl = $('#tbLog');
      if (logEl) logEl.textContent = L.log().join('\n');
    }

    function jalankan(btn, fn, pesanOk) {
      if (btn) btn.disabled = true;
      Promise.resolve().then(fn)
        .then(() => { if (pesanOk) toast(pesanOk); })
        .catch((e) => toast((e && e.message) || 'Perintah gagal.', 'err'))
        .then(() => paint());
    }

    function bindHasil() {
      const k = $('[data-kirim-ulang]');
      if (k) k.onclick = () => jalankan(k, async () => {
        const n = await TC.Readings.kirimTertunda();
        if (!n) throw new Error('Belum bisa mengirim ke server. Periksa koneksi internet.');
        toast(n + ' hasil terkirim.');
      });
    }

    function bind() {
      const sb = $('[data-sambung]');
      if (sb) sb.onclick = () => {
        sb.disabled = true;
        L.sambung().then(() => toast('TeleBand tersambung.')).catch((e) => {
          if (e && e.name === 'NotFoundError') toast('Tidak ada alat dipilih.', 'err');
          else if (e && e.name === 'SecurityError') toast('Bluetooth diblokir. Buka lewat HTTPS.', 'err');
          else toast('Gagal menyambung: ' + ((e && e.message) || e), 'err');
        }).then(draw);
      };

      const pt = $('[data-putus]');
      if (pt) pt.onclick = () => { L.putus(); toast('TeleBand diputus.'); draw(); };

      const sn = $('[data-sinkron]');
      if (sn) sn.onclick = () => jalankan(sn, () => L.sinkron(), 'Alat diminta mengirim ulang hasil tersimpan.');

      const mu = $('[data-mulai]');
      if (mu) mu.onclick = () => jalankan(mu, () => L.mulai());

      const st = $('[data-stop]');
      if (st) st.onclick = () => jalankan(st, () => L.stop(), 'Pengukuran dihentikan. Hasil sedang dikirim.');

      const hs = $('[data-hapus-semua]');
      if (hs) hs.onclick = async () => {
        const s = L.status();
        const ok = await confirmSheet({
          title: 'Hapus semua hasil di alat?',
          body: 'Semua hasil yang masih tersimpan di jam dihapus' +
                (s && s.tersimpan ? ' (' + s.tersimpan + ' hasil)' : '') +
                '. Hasil yang belum sampai ke aplikasi akan hilang untuk selamanya.',
          ok: 'Hapus semua', danger: true
        });
        if (ok) jalankan(hs, () => L.hapusSemua(), 'Penyimpanan alat dikosongkan.');
      };

      bindHasil();
    }

    draw();
    Router.onLeave(L.subscribe(paint));
  }

  TC.views = TC.views || {};
  TC.views.teleband = viewTeleband;
})(window.TC);
