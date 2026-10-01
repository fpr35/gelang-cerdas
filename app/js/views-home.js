/* ============================================================
   TeleCare App — views-home.js
   Beranda, detail vital, analisis, riwayat, notifikasi, artikel.
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, $$, esc, icon, clamp, Store, Router, setView, setTopbar, toast,
          hhmm, fullDate, relTime, greeting, initials, countdown } = TC;
  const D = TC.DATA;

  /* ---------------- KOMPONEN BERSAMA ---------------- */

  const aktifTeleband = () => (Store.activeDevice() || {}).type === 'teleband';
  const SIM = () => !!TC.FITUR.simulasi;

  /** Angka + satuan, atau "—" bila metrik belum terukur. */
  const angka = (x, unit) => (x == null ? '—' : x + (unit ? '<u>' + unit + '</u>' : ''));
  const tensi = (v) => (v.sys == null || v.dia == null ? '—' : v.sys + '/' + v.dia);

  function deviceBar() {
    const st = TC.Devices.statusText();
    const pending = Store.state.pendingSamples;
    // Kartu perangkat bergaya "device card": render 3D TeleBand, angka besar,
    // tombol pil sinkron. Seluruh kartu tetap satu tombol menuju /perangkat.
    // TeleBand mengukur langsung (tanpa buffer), jadi angkanya status ukur,
    // bukan jumlah sampel.
    const tb = aktifTeleband() ? (TC.TeleBandLink.status() || {}) : null;
    const besar = !st.on ? '—<u></u>'
      : tb ? (tb.mengukur ? 'Ukur<u>…</u>' : 'Siap<u></u>')
      : pending + '<u>sampel</u>';
    const sub = !st.on ? 'hubungkan lewat Bluetooth'
      : tb ? (tb.mengukur ? 'sedang mengukur…' : 'ketuk untuk mengukur')
      : (pending ? 'menunggu sinkronisasi' : 'buffer jam kosong');
    return `<button class="devbar devcard${st.on ? '' : ' is-off'}" data-devbar>
      <span class="devcard__txt">
        <span class="chip ${st.on ? 'chip--g' : 'chip--a'}">${st.on ? '<i class="dotlive"></i> Tersambung' : 'Belum tersambung'}</span>
        <b class="devcard__nama">${esc(st.t.split('·')[0].trim() || 'TeleBand')}</b>
        <small>${st.on ? esc(st.t.split('·').slice(1).join('·').trim() || 'Perangkat aktif') : 'Ketuk untuk menyambungkan'}</small>
        <span class="devcard__angka">${besar}</span>
        <small>${esc(sub)}</small>
      </span>
      <img class="devcard__img" src="../assets/3d/${TC.tema.kini() === 'biru' ? 'biru/' : ''}ikon/${st.on ? 'jam' : 'bluetooth'}.webp" alt="" draggable="false">
      <span class="sync devcard__sync" data-sync>${icon('sync')} Sinkron</span>
    </button>`;
  }

  function bindDeviceBar(root) {
    const bar = $('[data-devbar]', root);
    if (!bar) return;
    bar.onclick = async (e) => {
      if (e.target.closest('[data-sync]')) {
        e.stopPropagation();
        const btn = $('[data-sync]', bar);
        const dev = Store.activeDevice();
        if (!dev) { Router.navigate('/perangkat'); return; }
        if (dev.type === 'teleband' && !dev.connected) { Router.navigate('/teleband'); return; }
        if (!dev.connected) { toast('Perangkat terputus. Sambungkan ulang dulu.', 'err'); return; }
        btn.classList.add('is-busy');
        try {
          const n = await TC.Devices.sync();
          toast(n ? n + ' sampel berhasil dipindahkan.' : 'Buffer jam sudah kosong.');
        } catch (err) {
          toast(err.message, 'err');
        }
        btn.classList.remove('is-busy');
        Router.render();
        return;
      }
      Router.navigate(aktifTeleband() ? '/teleband' : (SIM() ? '/perangkat' : '/perangkat/pindai'));
    };
  }

  /**
   * Penanda asal angka. Dibedakan dengan jelas karena keduanya tampak sama
   * di layar: nilai simulasi bergerak semulus nilai sensor, jadi tanpa
   * penanda ini tidak ada cara membedakannya.
   */
  function sumberChip() {
    const V = TC.Vitals;
    if (!SIM()) {
      return V.adaDariAlat()
        ? `<span class="chip chip--g"><i class="dotlive"></i> dari TeleBand</span>`
        : `<span class="chip">${icon('info')} belum ada pengukuran</span>`;
    }
    const kunci = ['hr', 'spo2', 'temp', 'bp'];
    const dariAlat = kunci.filter((k) => V.sourceOf(k) === 'device').length;
    if (!dariAlat) return `<span class="chip chip--a">${icon('info')} simulasi</span>`;
    return dariAlat === kunci.length
      ? `<span class="chip chip--g"><i class="dotlive"></i> dari perangkat</span>`
      : `<span class="chip chip--g"><i class="dotlive"></i> sebagian dari perangkat</span>`;
  }

  /**
   * Label asal angka per kartu. Sejak TeleBand, satu layar bisa berisi angka
   * alat (detak, SpO₂), estimasi eksperimental alat (tensi, glukosa), dan
   * simulasi (suhu) sekaligus — satu penanda global tidak lagi cukup jujur.
   */
  function srcLabel(k) {
    const V = TC.Vitals;
    if (V.sourceOf(k) !== 'device') {
      return `<span class="vital__src">${SIM() ? 'simulasi' : 'belum diukur'}</span>`;
    }
    const nama = V.jenisAsal(k) === 'teleband' ? 'TeleBand' : 'perangkat';
    return V.eksperimental(k)
      ? `<span class="vital__src is-eks">estimasi eksperimental · ${nama}</span>`
      : `<span class="vital__src is-alat">dari ${nama}</span>`;
  }

  // Glukosa hanya tampil di beranda bila datang dari alat; nilai simulasinya
  // sudah diwakili kurva sesi makan.
  // Tanpa simulasi kartu glukosa selalu ada (berisi "—" sampai TeleBand mengukur).
  const tampilGlukosa = () => !SIM() || TC.Vitals.sourceOf('glucose') === 'device';
  // TeleBand tidak punya sensor suhu: tanpa simulasi, kartu suhu hanya muncul
  // bila suatu saat ada perangkat yang benar-benar memasoknya.
  const tampilSuhu = () => SIM() || TC.Vitals.sourceOf('temp') === 'device';

  function vitalsGrid() {
    const v = TC.Vitals.snapshot();
    return `<div class="vital-grid">
      <button class="vital vital--hr" data-vital="hr">
        ${TC.i3d('jantung', 'vital__ico')}
        <span class="vital__lab">Detak jantung</span>
        <span class="vital__val" data-v="hr">${angka(v.hr, 'bpm')}</span>
        <span data-src="hr">${srcLabel('hr')}</span>
        <canvas data-spark="hr"></canvas></button>
      <button class="vital vital--spo" data-vital="spo2">
        ${TC.i3d('oksigen', 'vital__ico')}
        <span class="vital__lab">SpO₂</span>
        <span class="vital__val" data-v="spo2">${angka(v.spo2, '%')}</span>
        <span data-src="spo2">${srcLabel('spo2')}</span>
        <canvas data-spark="spo2"></canvas></button>
      ${tampilSuhu() ? `<button class="vital vital--tmp" data-vital="temp">
        ${TC.i3d('suhu', 'vital__ico')}
        <span class="vital__lab">Suhu</span>
        <span class="vital__val" data-v="temp">${angka(v.temp, '°C')}</span>
        <span data-src="temp">${srcLabel('temp')}</span>
        <canvas data-spark="temp"></canvas></button>` : ''}
      <button class="vital vital--bp" data-vital="bp">
        ${TC.i3d('tensi', 'vital__ico')}
        <span class="vital__lab">Tekanan darah</span>
        <span class="vital__val" data-v="bp">${tensi(v)}</span>
        <span data-src="bp">${srcLabel('bp')}</span>
        <canvas data-spark="sys"></canvas></button>
      ${tampilGlukosa() ? `<button class="vital vital--glu" data-vital="glucose">
        ${TC.i3d('makan', 'vital__ico')}
        <span class="vital__lab">Glukosa</span>
        <span class="vital__val" data-v="glucose">${angka(v.glucose, 'mg/dL')}</span>
        <span data-src="glucose">${srcLabel('glucose')}</span>
        <canvas data-spark="glucose"></canvas></button>` : ''}
    </div>`;
  }

  function paintSparks(root) {
    const H = TC.Vitals.hist;
    const map = { hr: '#E2543F', spo2: '#0E7FB8', temp: '#E09B12', sys: '#6C5CE7', glucose: '#1759BA' };
    Object.keys(map).forEach((k) => {
      const cv = $(`[data-spark="${k}"]`, root);
      if (cv && H[k] && H[k].length > 1) TC.sparkline(cv, H[k].slice(-30), map[k]);
    });
  }

  function paintVitals(root) {
    const v = TC.Vitals.snapshot();
    const set = (k, txt) => {
      const el = $(`[data-v="${k}"]`, root);
      if (el) el.innerHTML = txt;
    };
    set('hr', angka(v.hr, 'bpm'));
    set('spo2', angka(v.spo2, '%'));
    set('temp', angka(v.temp, '°C'));
    set('bp', tensi(v));
    set('glucose', angka(v.glucose, 'mg/dL'));
    ['hr', 'spo2', 'temp', 'bp', 'glucose'].forEach((k) => {
      const el = $(`[data-src="${k}"]`, root);
      if (el) el.innerHTML = srcLabel(k);
    });
    paintSparks(root);
  }

  function bindVitalTaps(root) {
    $$('[data-vital]', root).forEach((b) => {
      b.onclick = () => Router.navigate('/vital/' + b.dataset.vital);
    });
  }

  /* ---------------- CAPAIAN TARGET GIZI HARI INI ----------------
     Dipakai Beranda dan Profil → Tujuan Kesehatan. Setiap zat gizi diberi
     status yang terbaca langsung — sisa, tercapai, atau lebih — bukan hanya
     batang kemajuan, supaya pengguna tahu apakah targetnya sudah terpenuhi. */
  const ZAT_TAMPIL = {
    kcal: ['🔥', '#FFF1D6'], carb: ['🌾', '#DCEEF9'],
    protein: ['🥚', '#EEF5FF'], fat: ['🥑', '#EEEBFD']
  };
  const CHIP_STATUS = { sisa: '', tercapai: 'chip--g', lebih: 'chip--a' };

  /**
   * @param {object} [prLuar]  hasil Meals.progresTarget(...) milik pasien lain (admin)
   * @param {object} [opsi]    { admin: true } — tanpa ajakan mencatat, kalimat untuk admin
   */
  function kartuTarget(prLuar, opsi) {
    const pr = prLuar || TC.Meals.progresTarget();
    const admin = !!(opsi && opsi.admin);
    const semua = pr.tercapai === pr.butir.length;
    return `<div class="card">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <span class="chip ${semua ? 'chip--g' : pr.tercapai ? 'chip--a' : ''}">
          ${semua ? icon('check') + ' ' : ''}${pr.tercapai} dari ${pr.butir.length} target tercapai</span>
        <span style="flex:1"></span>
        <span class="tiny muted">${pr.sesi} sesi makan hari ini</span>
      </div>
      ${pr.butir.map((b) => `
        <div class="macro">
          <span class="macro__ico" style="background:${ZAT_TAMPIL[b.key][1]}">${ZAT_TAMPIL[b.key][0]}</span>
          <b>${esc(b.label)}</b>
          <span class="num">${b.nilai}<s> / ${b.target} ${esc(b.unit)}</s></span>
        </div>
        <div class="bar"><i class="${b.status === 'lebih' ? 'over' : ''}"
          style="width:${(clamp(b.pct, 0, 1.15) * 100).toFixed(0)}%"></i></div>
        <div style="display:flex;justify-content:flex-end;margin:5px 0 12px">
          <span class="chip ${CHIP_STATUS[b.status]}" style="font-size:.68rem">
            ${b.status === 'tercapai' ? icon('check') + ' ' : ''}${esc(b.teks)}</span></div>`).join('')}
      ${pr.sesi ? '' : admin ? '<p class="small muted">Pasien belum mencatat sesi makan hari ini.</p>'
        : `<p class="small muted">Belum ada sesi makan hari ini.
        <a class="link" href="#/sesi/kamera">Catat sesi</a> untuk mulai menghitung.</p>`}
      <p class="tiny muted" style="margin-top:6px">Tercapai = 90–110% dari target. Dihitung dari sesi makan
        yang ${admin ? 'dicatat pasien' : 'Anda catat'} hari ini, termasuk sesi yang masih berjalan.</p>
    </div>`;
  }

  /* ---------------- BERANDA ----------------
     Catatan soal kartu EKG: yang dihitung aplikasi ini hanya LAJU (dari
     detak jantung), bukan klasifikasi irama. Sebelumnya di kartu itu
     tertulis "Sinus normal" secara literal, yang menyiratkan analisis
     morfologi yang tidak pernah dilakukan.

     Komentar ini sengaja berada di luar template: komentar HTML di dalam
     literal template ikut terkirim ke DOM peramban. */
  function viewHome() {
    const user = Store.user();
    const p = Store.profile();
    const now = new Date();
    const active = Store.state.activeMeal;
    const lastMeal = Store.state.meals[0];
    const unread = Store.unread();
    const dev = Store.activeDevice();

    setTopbar('');

    setView(`
      <div class="hero-head">
        <span class="avatar avatar--lg" style="border-radius:18px">${esc(initials(user.name))}</span>
        <div style="min-width:0">
          <b>${esc(greeting(now))}, ${esc(p.nickname || user.name.split(' ')[0])} 👋</b>
          <small>${esc(fullDate(now))}</small>
        </div>
        <button class="icon-btn" data-notif style="margin-left:auto" aria-label="Notifikasi">
          ${icon('bell')}${unread ? `<i class="badge">${unread}</i>` : ''}</button>
      </div>

      ${deviceBar()}

      <div class="section-title">${icon('heart')} Vital terkini
        <span class="push"></span>
        <span data-sumber>${sumberChip()}</span></div>
      ${vitalsGrid()}
      ${!SIM() && !TC.Vitals.adaDariAlat() ? `
        <p class="tiny muted mt">Angka terisi saat TeleBand tersambung dan mengukur.
          <a class="link" href="#/teleband">Ukur sekarang</a></p>` : ''}

      ${SIM() && dev && dev.connected && D.deviceType(dev.type).caps.indexOf('ecg') !== -1 ? `
        <div class="card mt">
          <div class="card__head">${icon('ecg')}<h3>Sinyal EKG · Lead I</h3>
            <span class="push"></span><span class="chip chip--r">MEREKAM</span></div>
          <div class="ecg-box"><canvas id="ecgHome"></canvas></div>
          <div style="display:flex;gap:18px;margin-top:10px;flex-wrap:wrap">
            <div class="tiny muted">Interval RR<b class="mono" style="display:block;color:var(--ink);font-size:.9rem" data-rr>—</b></div>
            <div class="tiny muted">HRV (RMSSD)<b class="mono" style="display:block;color:var(--ink);font-size:.9rem" data-hrv>—</b></div>
            <div class="tiny muted">Laju<b style="display:block;color:var(--green-600);font-size:.9rem" data-laju>—</b></div>
          </div>
        </div>` : ''}

      ${active ? `
        <div class="section-title">${icon('clock')} Sesi berjalan</div>
        <a class="card" href="#/sesi/berjalan" style="display:block">
          <div class="session-card">
            ${active.photo ? `<img src="${active.photo}" alt="">` : `<span class="ph">${icon('food')}</span>`}
            <div style="min-width:0;flex:1">
              <b>${esc(active.items.map((i) => i.n).join(', '))}</b>
              <small>${esc(active.kind)} · selesai makan ${hhmm(new Date(active.at))}</small>
              <div class="mt" style="display:flex;gap:6px;flex-wrap:wrap">
                ${active.points.map((pt) => `<span class="chip ${pt.done ? 'chip--g' : ''}" style="font-size:.66rem">${esc(pt.label)}</span>`).join('')}
              </div>
            </div>
            ${icon('chev', 'chev')}
          </div>
        </a>` : ''}

      <div class="section-title">${icon('food')} Ringkasan Hari Ini
        <span class="push"></span><a class="link" href="#/profil/tujuan">Atur target</a></div>
      ${kartuTarget()}

      <div class="section-title">${icon('sparkle')} Aksi cepat</div>
      <div class="quick">
        ${TC.FITUR.konsultasi
          ? `<a href="#/konsultasi"><i class="tile3d">${TC.i3d('stetoskop')}</i>Konsultasi</a>`
          : `<a href="#/teleband"><i class="tile3d">${TC.i3d('jantung')}</i>Ukur</a>`}
        <a href="#/sesi/kamera"><i class="tile3d">${TC.i3d('makan')}</i>Catat Sesi</a>
        <a href="#/perangkat"><i class="tile3d">${TC.i3d('jam')}</i>Perangkat</a>
        <a href="#/riwayat"><i class="tile3d">${TC.i3d('grafik')}</i>Riwayat</a>
      </div>

      ${lastMeal ? `
        <div class="section-title">${icon('clock')} Sesi Terakhir
          <span class="push"></span><a class="link" href="#/riwayat">Lihat semua</a></div>
        <a class="card" href="#/sesi/${esc(lastMeal.id)}" style="display:block">
          <div class="session-card">
            ${lastMeal.photo ? `<img src="${lastMeal.photo}" alt="">` : `<span class="ph">${icon('food')}</span>`}
            <div style="min-width:0;flex:1">
              <small>${icon('clock')} ${hhmm(new Date(lastMeal.at))} · ${esc(lastMeal.kind)}</small>
              <b style="margin-top:2px">${esc(ringkasSesi(lastMeal))}</b>
              <span class="chip chip--${lastMeal.delta > 45 ? 'r' : lastMeal.delta > 28 ? 'a' : 'g'}" style="margin-top:6px">${esc(lastMeal.category)}</span>
            </div>
            ${icon('chev', 'chev')}
          </div>
        </a>` : `
        <div class="section-title">${icon('clock')} Sesi Terakhir</div>
        <div class="card"><div class="empty" style="padding:26px 10px">${icon('food')}
          <b>Belum ada sesi tercatat</b>
          <p>${SIM() ? 'Potret makanan Anda untuk mulai melihat hubungan antara isi piring dan respons tubuh.'
            : 'Catat isi piring Anda, lalu ukur dengan TeleBand sebelum dan sesudah makan untuk melihat respons tubuh.'}</p>
          <a class="btn btn--primary btn--sm mt" href="#/sesi/kamera">Catat sesi pertama</a></div></div>`}

      ${TC.Meals.peakTrend(6).length > 1 ? `
        <div class="card mt">
          <div class="card__head">${icon('drop')}<h3>Puncak Gula Darah</h3>
            <span class="push"></span><span class="chip">${TC.Meals.peakTrend(6).length} sesi terakhir</span></div>
          ${SIM() ? '' : '<p class="tiny muted" style="margin:-6px 0 8px">Estimasi eksperimental TeleBand, bukan hasil laboratorium.</p>'}
          <div style="display:flex;align-items:center;gap:16px">
            <div><b style="font-size:1.7rem;letter-spacing:-.04em">${TC.Meals.peakTrend(1)[0]}</b>
              <span class="tiny muted"> mg/dL</span></div>
            <div class="chart-wrap" style="flex:1"><canvas id="peakChart" style="height:60px"></canvas></div>
          </div>
        </div>` : ''}

      <div class="section-title">${icon('sparkle')} Wawasan TeleCare AI</div>
      <div class="insight">
        <div class="insight__glow"></div>
        <div class="tag">${icon('sparkle')} TeleCare AI</div>
        <h5>${esc(insightTitle())}</h5>
        <p>${esc(insightBody())}</p>
        ${TC.FITUR.konsultasi ? `<a class="btn btn--primary btn--sm mt" href="#/konsultasi">Diskusikan dengan dokter ${icon('arrow')}</a>` : ''}
      </div>

      <div class="promo mt2">
        ${TC.ilus3d('analisis', 'promo__art')}
        <h3>Ukur dengan TeleBand</h3>
        <p>Sambungkan TeleBand lewat Bluetooth untuk mengukur detak jantung dan SpO₂ — hasilnya tersimpan di riwayat Anda.</p>
        <a class="btn btn--soft btn--sm" href="#/teleband">Mulai mengukur ${icon('arrow')}</a>
      </div>

      <div class="section-title">${icon('doc')} Bacaan untuk Anda</div>
      <div class="stack--sm stack">
        ${D.ARTICLES.slice(0, 3).map((a) => `
          <a class="row" style="border:1px solid var(--line);border-radius:16px;background:var(--surface)" href="#/artikel/${a.id}">
            <span class="row__ico" style="font-size:1.1rem">${a.emoji}</span>
            <div style="min-width:0"><b>${esc(a.title)}</b><small>${esc(a.cat)} · ${a.read} menit baca</small></div>
            ${icon('chev', 'chev')}
          </a>`).join('')}
      </div>
    `);

    const root = $('#view');
    bindDeviceBar(root);
    bindVitalTaps(root);
    paintSparks(root);
    $('[data-notif]').onclick = () => Router.navigate('/notifikasi');

    const peakCv = $('#peakChart');
    if (peakCv) {
      const data = TC.Meals.peakTrend(6);
      TC.lineChart(peakCv, [{ data, color: TC.tema.warna('--g2'), fill: true, dots: true }],
        { padL: 8, yLabels: false });
    }

    // pembaruan langsung
    let ecg = null;
    const ecgCv = $('#ecgHome');
    if (ecgCv) ecg = TC.EcgRenderer(ecgCv);

    const un = TC.Vitals.subscribe(() => {
      // Kartu glukosa muncul/hilang mengikuti asal datanya (TeleBand tersambung
      // atau lepas); itu mengubah susunan, jadi beranda digambar ulang.
      if (tampilGlukosa() !== !!$('[data-v="glucose"]', root)) { Router.render(); return; }
      // Tanpa simulasi, ajakan "Ukur sekarang" muncul/hilang mengikuti ada
      // tidaknya angka dari alat.
      if (!SIM() && TC.Vitals.adaDariAlat() === !!$('a[href="#/teleband"].link', root)) {
        Router.render(); return;
      }
      paintVitals(root);
      const sc = $('[data-sumber]', root);
      if (sc) sc.innerHTML = sumberChip();
      const rr = $('[data-rr]', root), hv = $('[data-hrv]', root);
      if (rr) rr.textContent = Math.round(60000 / TC.Vitals.state.hr) + ' ms';
      if (hv) hv.textContent = TC.Vitals.state.hrv + ' ms';
      const lj = $('[data-laju]', root);
      if (lj) {
        const hr = TC.Vitals.state.hr;
        lj.textContent = hr < 50 ? 'Bradikardia' : hr > 100 ? 'Takikardia' : 'Normal';
      }
    });

    const mealTimer = setInterval(() => {
      if (TC.Meals.tick()) Router.render();
    }, 1000);

    Router.onLeave(() => {
      un();
      clearInterval(mealTimer);
      if (ecg) ecg.stop();
    });
  }

  // Wawasan disusun dari yang diukur TeleBand (detak jantung dan SpO₂) serta
  // catatan sesi makan. Indeks stres tidak lagi dipakai: TeleBand tidak
  // mengukurnya.
  /** Ringkasan satu baris sebuah sesi makan untuk daftar & kartu. */
  function ringkasSesi(m) {
    if (m.status !== 'done') return 'sesi berjalan';
    if (m.delta == null) return 'gizi tercatat · titik gula darah belum cukup';
    if (m.v === 2) {
      return `puncak +${m.delta} mg/dL` + (m.pulih2jam == null ? ''
        : m.pulih2jam ? ' · kembali dekat awal dalam 2 jam' : ' · belum kembali dalam 2 jam');
    }
    return `puncak +${m.delta} mg/dL · normal dalam ${m.recovery} jam`;
  }

  /** Sumber wawasan tanpa simulasi: vital dari alat saat ini, atau hasil ukur terakhir. */
  function vitalWawasan() {
    if (SIM() || TC.Vitals.adaDariAlat()) return TC.Vitals.snapshot();
    const r = TC.Readings.list()[0];
    return r ? { hr: r.bpm, spo2: r.spo2, at: r.waktu || r.diterima } : null;
  }

  function insightLevel() {
    const v = vitalWawasan() || {};
    if (v.hr == null && v.spo2 == null) return -1;
    const sp = v.spo2, hr = v.hr;
    if ((sp != null && sp < 94) || (hr != null && (hr > 100 || hr < 50))) return 2;
    if ((sp != null && sp < 96) || (hr != null && hr > 90)) return 1;
    return 0;
  }
  function insightTitle() {
    const n = insightLevel();
    if (n === -1) return 'Belum ada hasil ukur';
    if (n === 2) return 'Ada pembacaan yang perlu diperhatikan';
    if (n === 1) return 'Ada angka yang sedikit menyimpang';
    return 'Ritme Anda stabil beberapa hari ini';
  }
  function insightBody() {
    const v = vitalWawasan() || {};
    const n = insightLevel();
    if (n === -1) {
      return 'Wawasan disusun dari detak jantung dan SpO₂ hasil ukur TeleBand Anda. ' +
        'Sambungkan TeleBand dan lakukan pengukuran pertama untuk mulai melihatnya.';
    }
    // Angka yang benar-benar dipakai disebutkan, supaya kalimat tidak pernah
    // menyimpulkan lebih dari datanya.
    const bagian = [];
    if (v.hr != null) bagian.push('detak jantung ' + v.hr + ' bpm');
    if (v.spo2 != null) bagian.push('SpO₂ ' + v.spo2 + '%');
    const kapan = !SIM() && !TC.Vitals.adaDariAlat() && v.at
      ? 'Hasil ukur ' + relTime(v.at) + ': ' : 'Saat ini: ';
    const meals = Store.state.meals.filter((m) => m.delta != null).slice(0, 3);
    const avgDelta = meals.length
      ? Math.round(meals.reduce((a, m) => a + m.delta, 0) / meals.length) : null;
    const gula = avgDelta == null ? ''
      : 'Rata-rata kenaikan gula darah setelah makan ' + avgDelta + ' mg/dL (estimasi). ';
    const awal = kapan + bagian.join(', ') + '. ';
    if (n === 2) {
      return awal + 'Ada angka di luar rentang umum. Duduk tenang beberapa menit lalu ukur ulang ' +
        'dengan TeleBand. Bila keluhan menyertai, segera hubungi tenaga kesehatan.';
    }
    if (n === 1) {
      return awal + 'Sedikit di luar kebiasaan umum. ' + gula +
        'Cukupi minum dan istirahat, lalu ukur ulang nanti.';
    }
    return awal + 'Berada di rentang yang baik. ' + gula +
      'Ukur rutin dengan TeleBand agar tren Anda makin jelas.';
  }

  /* ---------------- DETAIL VITAL ---------------- */
  const VITAL_META = {
    hr:   { title: 'Detak Jantung', unit: 'bpm', color: '#E2543F', key: 'hr',
            normal: '60–100 bpm saat istirahat',
            about: 'Diukur lewat fotopletismografi (PPG) pada perangkat yang Anda kenakan. Nilai saat istirahat lebih bermakna daripada nilai saat bergerak.' },
    spo2: { title: 'Saturasi Oksigen', unit: '%', color: '#0E7FB8', key: 'spo2',
            normal: '95–100%',
            about: 'Perbandingan penyerapan cahaya merah dan inframerah oleh darah. Pembacaan mudah terganggu bila perangkat longgar atau tangan dingin.' },
    temp: { title: 'Suhu Tubuh', unit: '°C', color: '#E09B12', key: 'temp',
            normal: '36,1–37,2 °C',
            about: 'Diukur dari kulit lalu dikompensasi terhadap suhu ruangan, sehingga cenderung sedikit berbeda dari termometer.' },
    bp:   { title: 'Tekanan Darah', unit: 'mmHg', color: '#6C5CE7', key: 'sys',
            normal: '< 120/80 mmHg',
            about: 'Perkiraan tidak langsung dari bentuk gelombang nadi. Wajib dikalibrasi dengan tensimeter lengan dan hanya untuk melihat kecenderungan.' },
    glucose: { title: 'Glukosa', unit: 'mg/dL', color: '#1759BA', key: 'glucose',
            normal: '70–140 mg/dL (acuan umum, bukan untuk estimasi ini)',
            about: 'Pada TeleBand, angka ini diperkirakan dari sinyal PPG jari dengan model yang menurut firmware-nya sendiri SANGAT eksperimental dan belum punya dasar ilmiah yang kuat. Jangan dipakai untuk keputusan apa pun.' }
  };

  function viewVital(params) {
    const meta = VITAL_META[params.kind] || VITAL_META.hr;
    const v = TC.Vitals.snapshot();
    const nilaiKini = (x) => (params.kind === 'bp' ? tensi(x) : (x[meta.key] == null ? '—' : x[meta.key]));
    const cur = nilaiKini(v);

    // Tanpa simulasi, grafik memakai hasil ukur TeleBand yang tersimpan — deret
    // nyata yang bertahan antar-sesi — bukan riwayat sementara di memori.
    const KOLOM = { hr: 'bpm', spo2: 'spo2', glucose: 'glukosa', bp: 'sis' };
    const riwayat = SIM() ? null : TC.hasilLokal()
      .filter((x) => KOLOM[params.kind] && x[KOLOM[params.kind]] != null)
      .slice(0, 60).reverse();
    // Tensi dan glukosa TeleBand selalu estimasi eksperimental.
    const eksAlat = !SIM() && (params.kind === 'bp' || params.kind === 'glucose');

    // Subjudul mengikuti asal angka yang sebenarnya. Sebelumnya layar ini
    // selalu mengaku "langsung dari perangkat", padahal beranda sudah jujur
    // membedakan sensor dari simulasi.
    const kind = VITAL_META[params.kind] ? params.kind : 'hr';
    const dariPerangkat = TC.Vitals.sourceOf(kind) === 'device';
    const eksperimental = TC.Vitals.eksperimental(kind);
    TC.topbar(meta.title, {
      sub: !dariPerangkat ? (SIM() ? 'Nilai simulasi purwarupa' : 'Belum diukur saat ini')
        : eksperimental ? 'Estimasi eksperimental dari perangkat'
        : 'Data langsung dari perangkat'
    });
    setView(`
      <div class="card tc">
        <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;font-weight:800">Saat ini</div>
        <div style="font-size:2.6rem;font-weight:800;letter-spacing:-.04em;line-height:1.1;margin:4px 0">
          <span data-live>${cur}</span>
          <span style="font-size:.4em;color:var(--muted);font-weight:700">${esc(meta.unit)}</span>
        </div>
        ${dariPerangkat || SIM()
          ? `<span class="chip chip--g"><i class="dotlive"></i> diperbarui ${TC.relTime(v.at)}</span>`
          : `<span class="chip">sambungkan TeleBand untuk mengukur</span>`}
      </div>

      ${eksperimental || eksAlat ? `<div class="note note--w mt">${icon('alert')}
        <div><b>Estimasi eksperimental, bukan alat medis</b>Angka ini tidak diukur langsung.
        Firmware alat menyatakan modelnya belum tervalidasi. Jangan dipakai untuk keputusan kesehatan.</div></div>` : ''}

      <div class="card mt">
        <div class="card__head"><h3>${SIM() ? '60 pembacaan terakhir' : 'Hasil ukur tersimpan'}</h3>
          <span class="push"></span>${SIM() ? srcLabel(kind)
            : `<span class="chip">${riwayat.length} hasil</span>`}</div>
        ${!SIM() && riwayat.length < 2
          ? `<p class="small muted">${params.kind === 'temp'
              ? 'TeleBand tidak mengukur suhu tubuh.'
              : riwayat.length ? 'Baru satu hasil ukur. Grafik muncul setelah ada dua hasil atau lebih.'
              : 'Belum ada hasil ukur TeleBand untuk ukuran ini.'}</p>`
          : `<div class="chart-wrap"><canvas id="vChart" style="height:170px"></canvas></div>`}
        ${params.kind === 'bp' ? `<div class="legend">
          <div><i style="background:#6C5CE7"></i>Sistolik</div>
          <div><i style="background:#7CC3E8"></i>Diastolik</div></div>` : ''}
      </div>

      <div class="card mt">
        <div class="card__head"><h3>Rentang acuan umum</h3></div>
        <p class="small muted">${esc(meta.normal)}</p>
      </div>

      <div class="card mt">
        <div class="card__head"><h3>Bagaimana ini diukur</h3></div>
        <p class="small" style="color:var(--ink-2)">${esc(meta.about)}</p>
      </div>

      <div class="note note--w mt">${icon('alert')}
        <div><b>Bukan hasil pemeriksaan medis</b>Angka ini perkiraan dari sensor wearable.
        Untuk keputusan klinis, gunakan alat ukur medis dan konsultasikan ke tenaga kesehatan.</div></div>

      ${TC.FITUR.konsultasi ? `<a class="btn btn--primary btn--block mt2" href="#/konsultasi">Tanyakan ke dokter ${icon('arrow')}</a>` : ''}
    `);

    function paint() {
      const cv = $('#vChart');
      if (!cv) return;
      if (!SIM()) {
        const lbl = riwayat.map((x) => TC.pad2(new Date(x.t).getDate()) + '/' + TC.pad2(new Date(x.t).getMonth() + 1));
        const k = KOLOM[params.kind];
        TC.lineChart(cv, params.kind === 'bp' ? [
          { data: riwayat.map((x) => x.sis), color: '#6C5CE7', fill: true, dots: true },
          { data: riwayat.map((x) => x.dia), color: '#7CC3E8', dots: true }
        ] : [{ data: riwayat.map((x) => x[k]), color: meta.color, fill: true, dots: true }],
        { xLabels: lbl.length <= 8 ? lbl : null });
        return;
      }
      const H = TC.Vitals.hist;
      if (params.kind === 'bp') {
        TC.lineChart(cv, [
          { data: H.sys, color: '#6C5CE7', fill: true },
          { data: H.dia, color: '#7CC3E8' }
        ], {});
      } else {
        TC.lineChart(cv, [{ data: H[meta.key], color: meta.color, fill: true }], {});
      }
    }
    paint();

    const un = TC.Vitals.subscribe(() => {
      const el = $('[data-live]');
      const s = TC.Vitals.snapshot();
      if (el) el.textContent = nilaiKini(s);
      if (SIM()) paint();
    });
    Router.onLeave(un);
  }

  /* ---------------- ANALISIS ---------------- */
  function viewAnalysis() {
    const tab = (location.hash.split('?tab=')[1]) || 'vital';
    TC.topbar('Analisis', { sub: 'Kecenderungan beberapa hari terakhir', back: false });

    const week = TC.weekTrend();
    const labels = week.map((d) => d.label);
    // Berapa hari yang benar-benar punya rekaman, dan berapa di antaranya
    // berasal dari sensor. Dipakai agar layar ini tidak pernah menyiratkan
    // tren yang datanya tidak ada.
    const hariAda = week.filter((d) => d.ada).length;
    const hariSensor = week.filter((d) => d.sumber === 'device').length;

    setView(`
      <div class="seg" id="anaSeg" role="tablist">
        <button data-atab="vital" class="${tab === 'vital' ? 'is-active' : ''}">Vital</button>
        <button data-atab="gizi" class="${tab === 'gizi' ? 'is-active' : ''}">Gizi</button>
        <button data-atab="sesi" class="${tab === 'sesi' ? 'is-active' : ''}">Respons</button>
      </div>
      <div id="tabBody" class="mt"></div>
    `);

    function renderTab(t) {
      const body = $('#tabBody');
      if (t === 'vital') {
        // Indeks stres, langkah harian, dan durasi tidur tidak ditampilkan:
        // TeleBand tidak mengukur satu pun dari ketiganya.
        body.innerHTML = `
          <div class="grid2">
            <div class="card">
              <div class="card__head">${icon('heart')}<h3>Detak jantung istirahat</h3></div>
              <div class="chart-wrap"><canvas id="cRhr" style="height:150px"></canvas></div>
              <div class="legend"><div><i style="background:#1E6FD9"></i>7 hari terakhir (bpm)</div></div>
            </div>

            <div class="card">
              <div class="card__head">${icon('spo2')}<h3>Saturasi terendah harian</h3></div>
              <div class="chart-wrap"><canvas id="cSpo2" style="height:150px"></canvas></div>
              <div class="legend"><div><i style="background:#0E7FB8"></i>SpO₂ terendah (%)</div></div>
            </div>
          </div>

          <div class="note note--${hariAda ? 'i' : 'w'} mt">${icon(hariAda ? 'info' : 'alert')}
            <div><b>${hariAda} dari 7 hari punya data</b>${
              !SIM()
                ? (hariAda
                  ? `Tren dihitung dari ${week.reduce((a, d) => a + d.n, 0)} hasil ukur TeleBand yang tersimpan. ` +
                    'Detak istirahat didekati dengan detak terendah tiap hari.'
                  : 'Belum ada hasil ukur. Sambungkan TeleBand dan lakukan pengukuran, lalu buka lagi layar ini.')
                : hariAda
                ? 'Tren dihitung dari pembacaan yang benar-benar berjalan di perangkat ini' +
                  (hariSensor ? `, ${hariSensor} hari di antaranya dari sensor.` : ', seluruhnya dari simulasi purwarupa.')
                : 'Belum ada rekaman. Biarkan aplikasi terbuka beberapa saat, atau sambungkan perangkat, lalu buka lagi layar ini.'
            }</div></div>

          ${hariAda >= 2 ? `
            <div class="insight mt">
              <div class="insight__glow"></div>
              <div class="tag">${icon('sparkle')} Pola pekan ini</div>
              <h5>${esc(weekSummaryTitle(week))}</h5>
              <p>${esc(weekSummaryBody(week))}</p>
            </div>` : ''}`;

        TC.lineChart($('#cRhr'), [{ data: week.map((d) => d.rhr), color: '#1E6FD9', fill: true, dots: true }],
          { xLabels: labels });
        TC.lineChart($('#cSpo2'), [{ data: week.map((d) => d.spo2), color: '#0E7FB8', fill: true, dots: true }],
          { xLabels: labels });

      } else if (t === 'gizi') {
        const days = last7Meals();
        const p = Store.profile();
        body.innerHTML = `
          <div class="card">
            <div class="card__head">${icon('fire')}<h3>Asupan kalori 7 hari</h3>
              <span class="push"></span><span class="chip">target ${p.targets.kcal} kkal</span></div>
            <div class="chart-wrap"><canvas id="cKcal" style="height:170px"></canvas></div>
          </div>
          <div class="card mt">
            <div class="card__head">${icon('food')}<h3>Komposisi zat gizi</h3></div>
            <div class="chart-wrap"><canvas id="cMacro" style="height:170px"></canvas></div>
            <div class="legend">
              <div><i style="background:#0E7FB8"></i>Karbohidrat</div>
              <div><i style="background:#1E6FD9"></i>Protein</div>
              <div><i style="background:#6C5CE7"></i>Lemak</div>
            </div>
          </div>
          <div class="note note--i mt">${icon('info')}
            <div><b>Seakurat pencatatan Anda</b>Berbeda dengan detak jantung yang diukur sensor,
            data gizi bergantung pada sesi yang Anda catat sendiri.</div></div>`;

        TC.barChart($('#cKcal'), days.map((d) => d.kcal), days.map((d) => d.label), '#E09B12');
        TC.lineChart($('#cMacro'), [
          { data: days.map((d) => d.carb), color: '#0E7FB8', fill: true },
          { data: days.map((d) => d.protein), color: '#1E6FD9' },
          { data: days.map((d) => d.fat), color: '#6C5CE7' }
        ], { xLabels: days.map((d) => d.label) });

      } else {
        // Hanya sesi yang kenaikannya benar-benar terhitung (titik sebelum dan
        // sesudah makan terukur); sesi "data kurang" tidak punya kurva.
        const meals = Store.state.meals.filter((m) => m.status === 'done' && m.peak != null).slice(0, 10);
        body.innerHTML = meals.length ? `
          <div class="card">
            <div class="card__head">${icon('drop')}<h3>Puncak gula darah antar sesi</h3></div>
            <div class="chart-wrap"><canvas id="cPeak" style="height:170px"></canvas></div>
            <div class="legend">
              <div><i style="background:#1E6FD9"></i>Puncak (mg/dL)</div>
              <div><i style="background:#B7D4FB"></i>${SIM() ? 'Baseline' : 'Sebelum makan'}</div></div>
          </div>
          <div class="section-title">${icon('doc')} Sesi dengan kenaikan terbesar</div>
          <div class="list">
            ${meals.slice().sort((a, b) => b.delta - a.delta).slice(0, 5).map((m) => `
              <a class="row" href="#/sesi/${esc(m.id)}">
                <span class="row__ico">${icon('food')}</span>
                <div style="min-width:0"><b>${esc(m.items.map((i) => i.n).join(', '))}</b>
                  <small>${esc(TC.shortDate(new Date(m.at)))} · ${esc(m.kind)}</small></div>
                <span class="chip chip--${m.delta > 45 ? 'r' : m.delta > 28 ? 'a' : 'g'}" style="margin-left:auto">+${m.delta}</span>
                ${icon('chev', 'chev')}
              </a>`).join('')}
          </div>
          <div class="note note--w mt">${icon('alert')}
            <div><b>Perkiraan, bukan hasil laboratorium</b>${SIM() ? 'Nilai ini dihitung dari sensor dan catatan asupan.'
            : 'Gula darah di sini adalah estimasi eksperimental TeleBand dari sinyal PPG jari.'}
            Tidak dapat dipakai untuk menegakkan diagnosis diabetes.</div></div>` : `
          <div class="empty">${icon('drop')}<b>Belum cukup data</b>
            <p>${SIM() ? 'Catat beberapa sesi makan untuk melihat pola respons tubuh Anda.'
              : 'Catat sesi makan, lalu ukur dengan TeleBand sebelum makan dan 1–2 jam sesudahnya.'}</p>
            <a class="btn btn--primary btn--sm mt" href="#/sesi/kamera">Catat sesi</a></div>`;

        if (meals.length) {
          const rev = meals.slice().reverse();
          TC.lineChart($('#cPeak'), [
            { data: rev.map((m) => m.peak), color: '#1E6FD9', fill: true, dots: true },
            { data: rev.map((m) => m.baseline), color: '#B7D4FB', dash: [4, 5] }
          ], { xLabels: rev.map((m) => TC.pad2(new Date(m.at).getDate())) });
        }
      }
    }

    renderTab(tab);

    // Segmen ini sengaja memakai `data-atab`, bukan `data-tab`: tab navigasi
    // bawah juga memakai `data-tab`, dan `$$` berlingkup seluruh dokumen —
    // sehingga menekan "Beranda" sebelumnya ikut menjalankan penggantian tab
    // Analisis sekaligus mencabut sorotan navigasi. Pencarian juga dibatasi
    // ke dalam wadah segmennya.
    const seg = $('#anaSeg');
    $$('[data-atab]', seg).forEach((b) => {
      b.onclick = () => {
        $$('[data-atab]', seg).forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        renderTab(b.dataset.atab);
        // URL diperbarui tanpa memicu navigasi, supaya tab yang sedang dibuka
        // ikut terbawa saat halaman dimuat ulang atau tautannya dibagikan.
        try {
          history.replaceState(null, '', '#/analisis?tab=' + b.dataset.atab);
        } catch (e) { /* peramban menolak, abaikan */ }
      };
    });
  }

  /** Rata-rata sebuah ukuran, hanya atas hari yang punya data. */
  function rerata(week, kunci) {
    const v = week.map((d) => d[kunci]).filter((x) => typeof x === 'number');
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  }

  function weekSummaryTitle(week) {
    // Hanya hari berdata yang dibandingkan; hari kosong tidak boleh menarik
    // rata-rata dan menciptakan "kecenderungan" yang tidak ada.
    const ada = week.filter((d) => d.ada && d.rhr != null);
    if (ada.length < 2) return 'Data belum cukup untuk menyimpulkan pola';
    const separuh = Math.ceil(ada.length / 2);
    const awal = ada.slice(0, separuh).reduce((a, d) => a + d.rhr, 0) / separuh;
    const akhir = ada.slice(-separuh).reduce((a, d) => a + d.rhr, 0) / separuh;
    if (akhir - awal > 2.5) return 'Detak jantung istirahat cenderung naik';
    if (awal - akhir > 2.5) return 'Detak jantung istirahat membaik';
    return 'Ritme pekan ini relatif stabil';
  }

  function weekSummaryBody(week) {
    const bagian = [];
    const rhr = rerata(week, 'rhr');
    if (rhr != null) bagian.push(`Detak jantung istirahat rata-rata ${Math.round(rhr)} bpm`);
    const spo2 = rerata(week, 'spo2');
    if (spo2 != null) bagian.push(`saturasi terendah rata-rata ${Math.round(spo2)}%`);
    return bagian.length ? bagian.join(', ') + '.' : 'Belum ada ukuran yang terkumpul.';
  }

  function last7Meals() {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const end = d.getTime() + 86400000;
      const list = Store.state.meals.filter((m) => m.at >= d.getTime() && m.at < end);
      const t = { label: TC.DAYS[d.getDay()].slice(0, 3), kcal: 0, carb: 0, protein: 0, fat: 0 };
      list.forEach((m) => {
        t.kcal += m.nutrition.kcal; t.carb += m.nutrition.carb;
        t.protein += m.nutrition.protein; t.fat += m.nutrition.fat;
      });
      out.push(t);
    }
    return out;
  }

  /* ---------------- RIWAYAT ---------------- */
  function viewHistory() {
    const tab = 'sesi';
    TC.topbar('Riwayat', { sub: 'Seluruh catatan Anda', back: false });
    setView(`
      <div class="seg">
        <button data-h="sesi" class="is-active">Sesi Makan</button>
        ${TC.FITUR.konsultasi ? '<button data-h="konsul">Konsultasi</button>' : ''}
        <button data-h="sync">${SIM() ? 'Sinkronisasi' : 'Hasil Ukur'}</button>
      </div>
      <div id="hBody" class="mt"></div>`);

    function draw(t) {
      const b = $('#hBody');
      if (t === 'sesi') {
        const meals = Store.state.meals;
        b.innerHTML = meals.length ? groupByDay(meals) : `
          <div class="empty">${icon('food')}<b>Belum ada sesi</b>
          <p>Setiap sesi makan yang Anda catat muncul di sini.</p>
          <a class="btn btn--primary btn--sm mt" href="#/sesi/kamera">Catat sesi</a></div>`;
      } else if (t === 'konsul') {
        const cs = Store.state.consults;
        b.innerHTML = cs.length ? `<div class="list">${cs.map((c) => {
          const doc = D.doctor(c.doctorId);
          return `<a class="row" href="#/chat/${esc(c.id)}">
            <span class="avatar" style="background:${doc ? doc.color : '#1E6FD9'}">${esc(initials(doc ? doc.name : '?'))}</span>
            <div style="min-width:0"><b>${esc(doc ? doc.name : 'Dokter')}</b>
              <small>${esc(c.mode === 'video' ? 'Video call' : 'Chat')} · ${esc(TC.relTime(c.startedAt))}</small></div>
            <span class="chip chip--${c.status === 'active' ? 'g' : ''}" style="margin-left:auto">
              ${c.status === 'active' ? 'Berlangsung' : 'Selesai'}</span>
            ${icon('chev', 'chev')}</a>`;
        }).join('')}</div>` : `
          <div class="empty">${icon('stetho')}<b>Belum ada konsultasi</b>
          <p>Mulai percakapan dengan dokter kapan saja — riwayat vital Anda ikut terlampir.</p>
          <a class="btn btn--primary btn--sm mt" href="#/konsultasi">Cari dokter</a></div>`;
      } else if (!SIM()) {
        // Hasil ukur TeleBand (tersimpan lokal dan di server).
        const hs = TC.Readings.list().slice(0, 50);
        const x = (v, u) => (v == null ? '—' : v + (u || ''));
        b.innerHTML = hs.length ? `<div class="list">${hs.map((r) => `
          <div class="row">
            <span class="row__ico">${icon('heart')}</span>
            <div style="min-width:0"><b>${x(r.bpm, ' bpm')} · SpO₂ ${x(r.spo2, '%')}</b>
              <small>${esc(TC.relTime(r.waktu || r.diterima))}${r.waktu ? ' · ' + hhmm(new Date(r.waktu)) : ''}
                · TD ${r.sis != null && r.dia != null ? r.sis + '/' + r.dia : '—'} · glukosa ${x(r.glukosa)}
                <span class="tiny">(estimasi)</span></small></div>
            <span class="chip ${r.tersinkron ? 'chip--g' : 'chip--a'}" style="margin-left:auto">
              ${r.tersinkron ? 'tersimpan' : 'belum terkirim'}</span>
          </div>`).join('')}</div>` : `
          <div class="empty">${icon('heart')}<b>Belum ada hasil ukur</b>
          <p>Hasil setiap pengukuran TeleBand tersimpan di sini.</p>
          <a class="btn btn--primary btn--sm mt" href="#/teleband">Ukur sekarang</a></div>`;
      } else {
        const vh = Store.state.vitalsHistory.slice().reverse().slice(0, 30);
        b.innerHTML = vh.length ? `<div class="list">${vh.map((v) => `
          <div class="row">
            <span class="row__ico">${icon('sync')}</span>
            <div><b>${v.hr} bpm · ${v.spo2}% · ${v.temp}°C</b>
              <small>${esc(TC.relTime(v.at))} · TD ${v.sys}/${v.dia} mmHg</small></div>
          </div>`).join('')}</div>` : `
          <div class="empty">${icon('sync')}<b>Belum ada sinkronisasi</b>
          <p>Ketuk tombol sinkronkan pada kartu perangkat di Beranda.</p></div>`;
      }
    }

    function groupByDay(meals) {
      const groups = {};
      meals.forEach((m) => {
        const d = new Date(m.at); d.setHours(0, 0, 0, 0);
        (groups[d.getTime()] = groups[d.getTime()] || []).push(m);
      });
      return Object.keys(groups).sort((a, b) => b - a).map((k) => {
        const d = new Date(+k);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const label = +k === today.getTime() ? 'Hari ini'
          : +k === today.getTime() - 86400000 ? 'Kemarin' : TC.shortDate(d);
        return `<div class="section-title" style="margin-top:16px">${esc(label)}</div>
          <div class="list">${groups[k].map((m) => `
            <a class="row" href="#/sesi/${esc(m.id)}">
              <span class="row__ico">${icon('food')}</span>
              <div style="min-width:0"><b>${esc(m.items.map((i) => i.n).join(', '))}</b>
                <small>${hhmm(new Date(m.at))} · ${m.nutrition.kcal} kkal · ${m.nutrition.carb} g karbo</small></div>
              ${m.status !== 'done' ? `<span class="chip chip--a" style="margin-left:auto">berjalan</span>`
                : m.delta == null ? `<span class="chip" style="margin-left:auto">data kurang</span>`
                : `<span class="chip chip--${m.delta > 45 ? 'r' : m.delta > 28 ? 'a' : 'g'}" style="margin-left:auto">+${m.delta}</span>`}
              ${icon('chev', 'chev')}
            </a>`).join('')}</div>`;
      }).join('');
    }

    draw(tab);
    $$('[data-h]').forEach((b) => {
      b.onclick = () => {
        $$('[data-h]').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        draw(b.dataset.h);
      };
    });
  }

  /* ---------------- NOTIFIKASI ---------------- */
  function viewNotifications() {
    TC.topbar('Notifikasi', {
      actions: `<button class="icon-btn" data-clear aria-label="Tandai terbaca">${icon('check')}</button>`
    });
    const list = Store.state.notifications;
    setView(list.length ? `<div class="list">${list.map((n) => `
      <div class="row" style="align-items:flex-start">
        <span class="row__ico" style="background:${n.kind === 'warn' ? '#FFF1D6' : n.kind === 'err' ? '#FFE6E2' : '#EEF5FF'};
          color:${n.kind === 'warn' ? '#8A5D00' : n.kind === 'err' ? '#E2543F' : '#1759BA'}">
          ${icon(n.kind === 'warn' ? 'alert' : n.kind === 'err' ? 'alert' : 'check')}</span>
        <div style="min-width:0"><b>${esc(n.title)}</b><small>${esc(n.body)}</small>
          <small class="tiny" style="color:var(--faint)">${esc(TC.relTime(n.at))}</small></div>
        ${!n.read ? '<i class="dotlive" style="margin-left:auto"></i>' : ''}
      </div>`).join('')}</div>` : `
      <div class="empty">${icon('bell')}<b>Belum ada notifikasi</b>
      <p>Peringatan dari perangkat dan pengingat konsultasi akan muncul di sini.</p></div>`);

    $('[data-clear]').onclick = () => {
      Store.update((s) => { s.notifications.forEach((n) => { n.read = true; }); });
      toast('Semua notifikasi ditandai terbaca.');
      Router.render();
    };
  }

  /* ---------------- ARTIKEL ---------------- */
  function viewArticle(params) {
    const a = D.ARTICLES.find((x) => x.id === params.id);
    if (!a) { Router.navigate('/home', true); return; }
    TC.topbar(a.cat, { sub: a.read + ' menit baca' });
    setView(`
      <div class="card" style="text-align:center;padding:30px">
        <div style="font-size:3rem">${a.emoji}</div>
      </div>
      <h2 style="font-size:1.3rem;margin:18px 0 12px">${esc(a.title)}</h2>
      <p style="color:var(--ink-2);font-size:.95rem;line-height:1.7">${esc(a.body)}</p>
      <p style="color:var(--ink-2);font-size:.95rem;line-height:1.7;margin-top:14px">
        Bacaan ini bersifat edukatif dan tidak menggantikan penilaian tenaga kesehatan.
        Bila keluhan Anda menetap atau memberat, periksakan diri ke tenaga kesehatan.</p>
      ${TC.FITUR.konsultasi ? `<a class="btn btn--primary btn--block mt2" href="#/konsultasi">Konsultasi sekarang ${icon('arrow')}</a>` : ''}`);
  }

  TC.views = TC.views || {};
  Object.assign(TC.views, {
    home: viewHome, vital: viewVital, analysis: viewAnalysis,
    history: viewHistory, notifications: viewNotifications, article: viewArticle,
    deviceBar, bindDeviceBar, kartuTarget
  });
})(window.TC);
