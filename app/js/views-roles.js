/* ============================================================
   TeleCare App — views-roles.js
   Layar untuk tiga peran selain pasien:
     · dokter        → klinik, antrean konsultasi, pasien binaan
     · admin-faskes  → dashboard unit, anggota, perangkat, nakes
     · admin         → ringkasan platform, pengguna, faskes, dokter
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, $$, esc, icon, clamp, rupiah, Store, Router, setView, setTopbar, toast,
          hhmm, relTime, shortDate, greeting, initials, sheet, closeSheet, confirmSheet } = TC;
  const D = TC.DATA;

  /* ============================================================
     KOMPONEN BERSAMA
     ============================================================ */

  function statusChip(st) {
    const m = D.STATUS_META[st] || D.STATUS_META.ok;
    return `<span class="chip chip--${m.c}">${esc(m.t)}</span>`;
  }

  function patientRow(p, href) {
    const m = D.STATUS_META[p.status];
    return `<a class="row" href="${href}">
      <span class="avatar" style="background:${m.color}">${esc(initials(p.name))}</span>
      <div style="min-width:0">
        <b>${esc(p.name)}</b>
        <small>${esc(p.unit)} · ${p.age} th · ${esc(p.device)}</small>
      </div>
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
        ${statusChip(p.status)}${icon('chev', 'chev')}</span>
    </a>`;
  }

  /** Batang komposisi Normal / Waspada / Kritis. */
  function triaseBar(ok, warn, crit) {
    const total = Math.max(1, ok + warn + crit);
    return `<div class="bar" style="height:10px;display:flex;overflow:hidden">
        <i style="width:${(ok / total * 100).toFixed(1)}%;background:var(--green-500)"></i>
        <i style="width:${(warn / total * 100).toFixed(1)}%;background:var(--amber-500)"></i>
        <i style="width:${(crit / total * 100).toFixed(1)}%;background:var(--coral-500)"></i>
      </div>
      <div class="legend" style="margin-top:9px">
        <div><i style="background:#049A5B"></i>Normal ${ok}</div>
        <div><i style="background:#E09B12"></i>Waspada ${warn}</div>
        <div><i style="background:#E2543F"></i>Kritis ${crit}</div>
      </div>`;
  }

  /** Deret 7 hari untuk grafik ringkas pada layar pengelola. */
  function series7(seedKey, lo, hi) {
    const s = Store.state;
    s._roleSeries = s._roleSeries || {};
    const day = new Date().getDate();
    if (!s._roleSeries[seedKey] || s._roleSeries[seedKey].day !== day) {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        days.push({ label: TC.DAYS[d.getDay()].slice(0, 3), v: TC.rint(lo, hi) });
      }
      Store.update((st) => { st._roleSeries[seedKey] = { day, days }; });
    }
    return s._roleSeries[seedKey].days;
  }


  /* ============================================================
     1N. DOKTER — DATA NYATA (TC.FITUR.simulasi mati)
     ============================================================
     Pasien binaan = pasien yang menautkan diri lewat KODE DOKTER
     (tabel care_links, supabase/migrations/20260926_care_links.sql).
     Angka yang tampil adalah hasil ukur TeleBand pasien dari tabel
     device_readings; status triase dihitung dari hasil terakhir dengan
     ambang yang sama seperti eskalasi di sisi pasien (TC.statusHasil).
     Catatan klinis dan penandaan eskalasi tetap lokal di peramban dokter.
     ============================================================ */
  const STATUS_NONE = { t: 'Belum ada data', c: '', color: '#8AA79B' };
  const metaStatus = (st) => D.STATUS_META[st] || STATUS_NONE;
  const chipStatus = (st) => `<span class="chip ${metaStatus(st).c ? 'chip--' + metaStatus(st).c : ''}">${esc(metaStatus(st).t)}</span>`;

  function namaDokter() {
    const u = Store.user() || {};
    return (Store.profile().nickname || u.name || 'Dokter').slice(0, 80);
  }

  /** Pesan galat Supabase yang bisa dipahami, termasuk migrasi yang belum dijalankan. */
  function pesanGalat(e, berkas) {
    if (TC.CareDB && TC.CareDB.belumDimigrasi(e)) {
      return (berkas ? 'Tabel unit faskes' : 'Tabel hubungan dokter–pasien') +
        ' belum ada di server. Jalankan supabase/migrations/' +
        (berkas || '20260926_care_links.sql') + ' di Supabase SQL Editor.';
    }
    return (e && e.message) || 'Gagal memuat data dari server.';
  }

  /** Pasien tertaut beserta hasil ukur terakhirnya. */
  async function muatPasienNyata() {
    const links = await TC.CareDB.pasienSaya();
    return Promise.all(links.map(async (l) => {
      let rows = [];
      try { rows = await TC.ReadingsDB.daftar(l.patient_id, 1); } catch (e) { /* tampil tanpa data */ }
      const terakhir = TC.hasilDariBaris(rows)[0] || null;
      return { id: l.patient_id, nama: l.patient_name, sejak: l.created_at,
               terakhir, status: TC.statusHasil(terakhir) };
    }));
  }

  function barisPasienNyata(p, dasar) {
    const r = p.terakhir;
    const x = (v, u) => (v == null ? '—' : v + u);
    return `<a class="row" href="${dasar || '#/klinik/pasien/'}${esc(p.id)}">
      <span class="avatar" style="background:${metaStatus(p.status).color}">${esc(initials(p.nama))}</span>
      <div style="min-width:0">
        <b>${esc(p.nama)}</b>
        <small>${r ? `${x(r.bpm, ' bpm')} · SpO₂ ${x(r.spo2, '%')} · ${esc(relTime(r.t))}`
          : 'Belum ada hasil ukur TeleBand'}</small>
      </div>
      <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
        ${chipStatus(p.status)}${icon('chev', 'chev')}</span>
    </a>`;
  }

  const URUT_STATUS = { crit: 0, warn: 1, ok: 2, none: 3 };

  function viewClinicNyata() {
    const u = Store.user();
    setTopbar('');
    setView(`
      <div class="hero-head">
        <span class="avatar avatar--lg" style="background:#0E7FB8;border-radius:18px">
          ${esc(initials(namaDokter()))}</span>
        <div style="min-width:0">
          <b>${esc(greeting(new Date()))}, ${esc(namaDokter())}</b>
          <small>${esc(u.email && !/@tamu\.local$/.test(u.email) ? u.email : 'Dokter')}</small>
        </div>
        <button class="icon-btn" data-notif style="margin-left:auto" aria-label="Notifikasi">
          ${icon('bell')}</button>
      </div>

      <div class="card">
        <div class="card__head">${icon('link')}<h3>Kode dokter</h3></div>
        <p class="small muted">Berikan kode ini ke pasien. Setelah pasien memasukkannya di
          <b>Profil → Dokter saya</b>, hasil ukur TeleBand-nya muncul di sini.</p>
        <div id="kodeBox" class="mt"><p class="small muted">Memuat…</p></div>
      </div>

      <div id="klinikIsi" class="mt"><p class="small muted tc" style="padding:18px">Memuat pasien…</p></div>
    `);
    $('[data-notif]').onclick = () => Router.navigate('/notifikasi');

    gambarKode();
    muatPasienNyata().then((daftar) => {
      const box = $('#klinikIsi');
      if (!box) return;
      const perhatian = daftar.filter((p) => p.status === 'warn' || p.status === 'crit')
        .sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status]);
      box.innerHTML = `
        <div class="stat-row">
          <div><b>${daftar.length}</b><span>Pasien terhubung</span></div>
          <div><b>${perhatian.length}</b><span>Perlu perhatian</span></div>
        </div>
        <div class="section-title">${icon('alert')} Pasien perlu perhatian
          <span class="push"></span><span class="chip chip--a">${perhatian.length}</span></div>
        ${perhatian.length ? `<div class="list">${perhatian.map((p) => barisPasienNyata(p)).join('')}</div>`
          : `<div class="card"><p class="small muted tc" style="padding:14px">${daftar.length
            ? 'Hasil ukur terakhir semua pasien berada di rentang umum.'
            : 'Belum ada pasien yang terhubung.'}</p></div>`}
        ${daftar.length ? `<a class="btn btn--ghost btn--block mt" href="#/klinik/pasien">Lihat semua pasien</a>` : ''}`;
    }).catch((e) => {
      const box = $('#klinikIsi');
      if (box) box.innerHTML = `<div class="note note--w">${icon('alert')}<div><b>Data pasien belum bisa dimuat</b>${esc(pesanGalat(e))}</div></div>`;
    });
  }

  async function gambarKode() {
    const box = $('#kodeBox');
    if (!box) return;
    let kode = null;
    try { kode = await TC.CareDB.kodeSaya(); }
    catch (e) {
      box.innerHTML = `<div class="note note--w">${icon('alert')}<div>${esc(pesanGalat(e))}</div></div>`;
      return;
    }
    if (!$('#kodeBox')) return;
    box.innerHTML = kode ? `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <b class="mono" style="font-size:1.7rem;letter-spacing:.18em">${esc(kode)}</b>
        <span class="push" style="flex:1"></span>
        <button class="btn btn--soft btn--sm" data-kode-salin>${icon('doc')} Salin</button>
        <button class="btn btn--ghost btn--sm" data-kode-baru>${icon('refresh')} Ganti kode</button>
      </div>
      <p class="tiny muted mt">Mengganti kode tidak memutus pasien yang sudah terhubung; kode lama saja yang tidak berlaku.</p>` : `
      <button class="btn btn--primary btn--block" data-kode-baru>${icon('plus')} Buat kode dokter</button>`;
    const salin = $('[data-kode-salin]');
    if (salin) salin.onclick = () => {
      (navigator.clipboard ? navigator.clipboard.writeText(kode) : Promise.reject())
        .then(() => toast('Kode disalin.'), () => toast('Salin manual: ' + kode));
    };
    $('[data-kode-baru]').onclick = async (ev) => {
      const b = ev.currentTarget;
      b.classList.add('is-disabled');
      try {
        await TC.CareDB.buatKode(namaDokter());
        toast('Kode dokter siap dibagikan.');
      } catch (e) { toast(pesanGalat(e), 'err'); }
      gambarKode();
    };
  }

  function viewPatientsNyata() {
    TC.topbar('Pasien Binaan', { sub: 'Pasien yang terhubung lewat kode dokter', back: false });
    setView(`
      <div class="searchbar">${icon('search')}
        <input id="pq" type="search" placeholder="Cari nama pasien" aria-label="Cari pasien"></div>
      <div class="list mt" id="pList"><p class="small muted tc" style="padding:18px">Memuat…</p></div>`);
    let semua = [], q = '';
    function draw() {
      const box = $('#pList');
      if (!box) return;
      const list = semua.filter((p) => !q || p.nama.toLowerCase().indexOf(q) !== -1)
        .sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status]);
      box.innerHTML = list.length ? list.map((p) => barisPasienNyata(p)).join('')
        : `<div class="empty" style="background:var(--surface)">${icon('users')}
           <b>${semua.length ? 'Tidak ditemukan' : 'Belum ada pasien'}</b>
           <p>${semua.length ? 'Coba kata kunci lain.' : 'Bagikan kode dokter dari layar Klinik ke pasien Anda.'}</p></div>`;
    }
    $('#pq').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
    muatPasienNyata().then((d) => { semua = d; draw(); }).catch((e) => {
      const box = $('#pList');
      if (box) box.innerHTML = `<div class="note note--w">${icon('alert')}<div>${esc(pesanGalat(e))}</div></div>`;
    });
  }

  function viewPatientDetailNyata(params) {
    const pid = params.id;
    // Admin faskes memakai layar yang sama untuk anggota unitnya: sumber
    // keanggotaan berbeda, dan ia bukan klinisi sehingga tanpa catatan klinis.
    const FASKES = Store.is('admin-faskes');
    const KEMBALI = FASKES ? '/faskes/anggota' : '/klinik/pasien';
    let unitId = null;
    TC.topbar('Pasien', { sub: 'Memuat…' });
    setView(`<p class="small muted tc" style="padding:24px">Memuat data pasien…</p>`);

    const muatTautan = FASKES
      ? muatUnit().then((d) => {
          if (!d.unit) return [];
          unitId = d.unit.id;
          return d.anggota.map((a) => ({ patient_id: a.id, patient_name: a.nama, created_at: a.sejak }));
        })
      : TC.CareDB.pasienSaya();

    Promise.all([muatTautan, TC.ReadingsDB.daftar(pid, 200)]).then(([links, rows]) => {
      const link = links.find((l) => l.patient_id === pid);
      if (!link) {
        toast(FASKES ? 'Orang ini bukan anggota unit Anda.' : 'Pasien ini tidak terhubung dengan Anda.', 'err');
        Router.navigate(KEMBALI, true); return;
      }
      const hasil = TC.hasilDariBaris(rows);
      const r = hasil[0] || null;
      const st = TC.statusHasil(r);
      const tren = TC.trenDariHasil(hasil);
      const x = (v) => (v == null ? '—' : v);
      const nama = link.patient_name;

      TC.topbar(nama, { sub: (FASKES ? 'Anggota sejak ' : 'Terhubung ') + shortDate(new Date(link.created_at)) });
      setView(`
        <div class="card" style="display:flex;gap:14px;align-items:center">
          <span class="avatar avatar--lg" style="background:${metaStatus(st).color}">${esc(initials(nama))}</span>
          <div style="min-width:0">
            <b style="font-size:1rem">${esc(nama)}</b>
            <small class="muted" style="display:block;font-size:.8rem">${r
              ? 'Hasil ukur terakhir ' + esc(relTime(r.t)) : 'Belum ada hasil ukur'}</small>
          </div>
          <span style="margin-left:auto">${chipStatus(st)}</span>
        </div>

        <div class="vital-grid mt">
          <div class="vital vital--hr"><span class="vital__lab">${icon('heart')} Detak jantung</span>
            <span class="vital__val">${x(r && r.bpm)}<u>bpm</u></span></div>
          <div class="vital vital--spo"><span class="vital__lab">${icon('spo2')} SpO₂</span>
            <span class="vital__val">${x(r && r.spo2)}<u>%</u></span></div>
          <div class="vital vital--bp"><span class="vital__lab">${icon('bp')} Tekanan darah</span>
            <span class="vital__val">${r && r.sis != null && r.dia != null ? r.sis + '/' + r.dia : '—'}</span>
            <span class="vital__src is-eks">estimasi eksperimental</span></div>
          <div class="vital vital--glu"><span class="vital__lab">${icon('drop')} Glukosa</span>
            <span class="vital__val">${x(r && r.glukosa)}<u>mg/dL</u></span>
            <span class="vital__src is-eks">estimasi eksperimental</span></div>
        </div>

        <div class="card mt">
          <div class="card__head">${icon('chart')}<h3>Detak jantung terendah · 7 hari</h3>
            <span class="push"></span><span class="chip">${tren.filter((d) => d.ada).length} hari berdata</span></div>
          ${tren.some((d) => d.rhr != null)
            ? `<div class="chart-wrap"><canvas id="cPat" style="height:150px"></canvas></div>`
            : `<p class="small muted">Belum ada hasil ukur dalam 7 hari terakhir.</p>`}
        </div>

        <div class="section-title">${icon('doc')} Hasil ukur terbaru
          <span class="push"></span><span class="chip">${hasil.length}</span></div>
        ${hasil.length ? `<div class="list">${hasil.slice(0, 10).map((h) => `
          <div class="row"><span class="row__ico">${icon('heart')}</span>
            <div style="min-width:0"><b>${x(h.bpm)} bpm · SpO₂ ${x(h.spo2)}%</b>
              <small>${esc(shortDate(new Date(h.t)))} · ${esc(hhmm(new Date(h.t)))} ·
                TD ${h.sis != null && h.dia != null ? h.sis + '/' + h.dia : '—'} · glukosa ${x(h.glukosa)} (estimasi)</small></div>
            <span style="margin-left:auto">${chipStatus(TC.statusHasil(h))}</span></div>`).join('')}</div>`
          : `<div class="card"><p class="small muted tc" style="padding:14px">Pasien belum mengirim hasil ukur TeleBand.</p></div>`}

        ${FASKES ? '' : `<div class="section-title">${icon('doc')} Catatan klinis
          <span class="push"></span><span class="chip" data-note-count>${TC.Notes.count(pid)}</span></div>
        <div class="card">
          <label class="field">
            <span>Catatan baru</span>
            <textarea id="noteText" rows="4" maxlength="4000"
              placeholder="Temuan pemeriksaan, penilaian, dan rencana tindak lanjut…"></textarea>
            <small>Setelah disimpan, isi catatan tidak dapat diubah — hanya dihapus.</small>
          </label>
          <button class="btn btn--primary btn--block mt" data-note-save>${icon('check')} Simpan catatan</button>
        </div>
        <div id="patNotes" class="mt">${gambarCatatan(pid, true)}</div>`}

        <div class="section-title">${icon('alert')} Penandaan eskalasi
          <span class="push"></span><span class="chip" data-esc-count>${Store.escalationsFor(pid).length}</span></div>
        <div id="patEsk">${gambarEskalasi(pid)}</div>

        <div class="grid2 mt2">
          <button class="btn btn--ghost btn--block" data-esc>${icon('alert')} Tandai eskalasi</button>
          <button class="btn btn--dangerSoft btn--block" data-putus>${icon('x')} ${FASKES ? 'Keluarkan dari unit' : 'Putuskan pasien'}</button>
        </div>

        <div class="note note--i mt2">${icon('info')}
          <div><b>Sumber data</b>Angka di halaman ini adalah hasil ukur TeleBand milik pasien yang
          tersimpan di server. Tekanan darah dan glukosa adalah estimasi eksperimental.
          ${FASKES ? 'Penandaan eskalasi' : 'Catatan klinis dan penandaan eskalasi'} tersimpan di peramban perangkat ini saja.</div></div>
      `);

      const cv = $('#cPat');
      if (cv) TC.lineChart(cv, [{ data: tren.map((d) => d.rhr), color: metaStatus(st).color === '#8AA79B' ? '#049A5B' : metaStatus(st).color, fill: true, dots: true }],
        { xLabels: tren.map((d) => d.label) });

      function segarkan() {
        if ($('#patNotes')) {
          $('#patNotes').innerHTML = gambarCatatan(pid, true);
          $('[data-note-count]').textContent = TC.Notes.count(pid);
        }
        $('#patEsk').innerHTML = gambarEskalasi(pid);
        $('[data-esc-count]').textContent = Store.escalationsFor(pid).length;
        pasang();
      }
      function pasang() {
        $$('[data-note-del]').forEach((b) => {
          b.onclick = async () => {
            const ok = await confirmSheet({ title: 'Hapus catatan klinis?',
              body: 'Catatan yang dihapus tidak dapat dikembalikan.', ok: 'Hapus', danger: true });
            if (!ok) return;
            TC.Notes.remove(pid, b.dataset.noteDel);
            segarkan(); toast('Catatan dihapus.');
          };
        });
        $$('[data-esc-del]').forEach((b) => {
          b.onclick = () => { Store.removeEscalation(b.dataset.escDel); segarkan(); toast('Penandaan dihapus.'); };
        });
      }
      pasang();

      const simpanCatatan = $('[data-note-save]');
      if (simpanCatatan) simpanCatatan.onclick = () => {
        const ta = $('#noteText');
        const isi = ta.value.trim();
        if (!isi) { toast('Catatan masih kosong.'); ta.focus(); return; }
        TC.Notes.add(pid, isi, namaDokter(), Store.role());
        ta.value = '';
        segarkan(); toast('Catatan klinis disimpan.');
      };
      $('[data-esc]').onclick = () => {
        Store.addEscalation(pid, FASKES ? (Store.user() || {}).name || 'Admin faskes' : namaDokter());
        Store.notify('Eskalasi ditandai', nama, 'warn');
        segarkan(); toast('Pasien ditandai untuk tindak lanjut.');
      };
      $('[data-putus]').onclick = async () => {
        const ok = await confirmSheet({
          title: (FASKES ? 'Keluarkan ' : 'Putuskan ') + nama + '?',
          body: FASKES
            ? 'Anda tidak lagi dapat melihat hasil ukurnya. Ia bisa bergabung ulang dengan kode unit.'
            : 'Anda tidak lagi dapat melihat hasil ukurnya. Pasien bisa menautkan ulang dengan kode dokter.',
          ok: FASKES ? 'Keluarkan' : 'Putuskan', danger: true });
        if (!ok) return;
        try {
          if (FASKES) await TC.FacilityDB.keluarkan(unitId, pid);
          else await TC.CareDB.putus(pid, TC.FB.uid);
          toast(FASKES ? 'Anggota dikeluarkan.' : 'Pasien diputus.');
          Router.navigate(KEMBALI, true);
        } catch (e) { toast(pesanGalat(e, FASKES ? '20260926_facilities.sql' : null), 'err'); }
      };
    }).catch((e) => {
      setView(`<div class="note note--w">${icon('alert')}<div><b>Data pasien belum bisa dimuat</b>${
        esc(pesanGalat(e, FASKES ? '20260926_facilities.sql' : null))}</div></div>`);
    });
  }

  /* ============================================================
     2N. ADMIN FASKES — DATA NYATA (TC.FITUR.simulasi mati)
     ============================================================
     Unit = baris tabel facilities milik admin ini. Anggota (pasien) dan
     nakes (dokter) bergabung sendiri dengan KODE UNIT lewat Profil → Unit
     saya (supabase/migrations/20260926_facilities.sql). Semua angka di
     layar-layar ini dihitung dari keanggotaan itu dan hasil ukur TeleBand
     anggota di tabel device_readings — tidak ada katalog contoh.
     ============================================================ */
  const FILE_UNIT = '20260926_facilities.sql';
  const JENIS_UNIT = ['Perusahaan', 'Pesantren', 'Sekolah Berasrama', 'Panti Jompo', 'Klinik', 'Lainnya'];
  const HARI = 86400000;

  /** Unit milik admin ini beserta anggota, nakes, dan hasil ukur anggota. */
  async function muatUnit() {
    const unit = await TC.FacilityDB.milikSaya();
    if (!unit) return { unit: null, anggota: [], nakes: [], rows: [] };
    const semua = await TC.FacilityDB.anggota(unit.id);
    const pasien = semua.filter((m) => m.role === 'pasien');
    const nakes = semua.filter((m) => m.role === 'dokter');
    let rows = [];
    try { rows = await TC.ReadingsDB.daftarBanyak(pasien.map((m) => m.user_id), 2000); }
    catch (e) { /* anggota tetap tampil, tanpa angka */ }
    const perOrang = {};
    rows.forEach((r) => { (perOrang[r.user_id] = perOrang[r.user_id] || []).push(r); });
    const anggota = pasien.map((m) => {
      const hasil = TC.hasilDariBaris(perOrang[m.user_id] || []);
      const terakhir = hasil[0] || null;
      return { id: m.user_id, nama: m.member_name, sejak: m.created_at,
               terakhir, status: TC.statusHasil(terakhir), hasil };
    });
    return { unit, anggota, nakes, rows };
  }

  const waktuBaris = (r) => new Date(r.measured_at || r.received_at).getTime();

  /** Tampilan saat unit belum ada: formulir pembuatan unit. */
  function formUnitBaru() {
    setView(`
      <div class="card">
        <div class="card__head">${icon('building')}<h3>Buat unit Anda</h3></div>
        <p class="small muted">Satu akun admin faskes mengelola satu unit. Setelah dibuat, Anda
          mendapat <b>kode unit</b> untuk dibagikan ke anggota (pasien) dan tenaga kesehatan.</p>
        <form id="fUnit" class="mt" novalidate>
          <label class="field"><span>Nama unit</span>
            <span class="wrap"><input name="name" maxlength="80" required placeholder="Mis. Klinik Pratama Sehat"></span></label>
          <label class="field"><span>Jenis</span>
            <span class="wrap"><select name="kind">${JENIS_UNIT.map((j) => `<option>${esc(j)}</option>`).join('')}</select></span></label>
          <label class="field"><span>Kota</span>
            <span class="wrap"><input name="city" maxlength="60" placeholder="Mis. Surakarta"></span></label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">${icon('check')} Buat unit</button>
        </form>
      </div>`);
    $('#fUnit').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.name.value.trim()) { toast('Nama unit wajib diisi.', 'err'); return; }
      try {
        await TC.FacilityDB.buat({ name: f.name.value, kind: f.kind.value, city: f.city.value });
        toast('Unit dibuat. Bagikan kode unitnya ke anggota.');
        Router.render();
      } catch (err) { toast(pesanGalat(err, FILE_UNIT), 'err'); }
    };
  }

  function galatUnit(e) {
    setView(`<div class="note note--w">${icon('alert')}<div><b>Data unit belum bisa dimuat</b>${
      esc(pesanGalat(e, FILE_UNIT))}</div></div>`);
  }

  function kartuKodeUnit(unit) {
    return `<div class="card mt">
      <div class="card__head">${icon('link')}<h3>Kode unit</h3></div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <b class="mono" style="font-size:1.6rem;letter-spacing:.18em" data-kode>${esc(unit.code)}</b>
        <span style="flex:1"></span>
        <button class="btn btn--soft btn--sm" data-kode-salin>${icon('doc')} Salin</button>
        <button class="btn btn--ghost btn--sm" data-kode-ganti>${icon('refresh')} Ganti kode</button>
      </div>
      <p class="tiny muted mt">Anggota dan nakes memasukkan kode ini di <b>Profil → Unit saya</b>.
        Mengganti kode tidak mengeluarkan yang sudah bergabung.</p>
    </div>`;
  }

  function pasangKodeUnit(unit) {
    $('[data-kode-salin]').onclick = () => {
      const kode = $('[data-kode]').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(kode) : Promise.reject())
        .then(() => toast('Kode disalin.'), () => toast('Salin manual: ' + kode));
    };
    $('[data-kode-ganti]').onclick = async () => {
      const ok = await confirmSheet({ title: 'Ganti kode unit?',
        body: 'Kode lama tidak berlaku lagi untuk bergabung. Anggota yang sudah ada tetap di unit.', ok: 'Ganti' });
      if (!ok) return;
      try { $('[data-kode]').textContent = await TC.FacilityDB.gantiKode(unit.id); toast('Kode unit diganti.'); }
      catch (e) { toast(pesanGalat(e, FILE_UNIT), 'err'); }
    };
  }

  function viewFacilityNyata() {
    setTopbar('');
    setView(`<p class="small muted tc" style="padding:24px">Memuat unit…</p>`);
    muatUnit().then((d) => {
      if (!d.unit) { formUnitBaru(); return; }
      const { unit, anggota, nakes, rows } = d;
      const hitung = (st) => anggota.filter((a) => a.status === st).length;
      const perhatian = anggota.filter((a) => a.status === 'warn' || a.status === 'crit')
        .sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status]);
      // Jumlah hasil ukur per hari, 7 hari terakhir.
      const hari = [];
      for (let i = 6; i >= 0; i--) {
        const t = new Date(); t.setDate(t.getDate() - i); t.setHours(0, 0, 0, 0);
        const t0 = t.getTime();
        hari.push({ label: TC.DAYS[t.getDay()].slice(0, 3),
                    n: rows.filter((r) => waktuBaris(r) >= t0 && waktuBaris(r) < t0 + HARI).length });
      }

      setView(`
        <div class="hero-head">
          <span class="avatar avatar--lg" style="background:#6C5CE7;border-radius:18px">${icon('building')}</span>
          <div style="min-width:0">
            <b>${esc(unit.name)}</b>
            <small>${esc(unit.kind)}${unit.city ? ' · ' + esc(unit.city) : ''}</small>
          </div>
          <button class="icon-btn" data-notif style="margin-left:auto" aria-label="Notifikasi">${icon('bell')}</button>
        </div>

        <div class="stat-row">
          <div><b>${anggota.length}</b><span>Anggota</span></div>
          <div><b>${nakes.length}</b><span>Nakes</span></div>
          <div><b style="${perhatian.length ? 'color:var(--coral-500)' : ''}">${perhatian.length}</b><span>Perlu perhatian</span></div>
        </div>

        ${kartuKodeUnit(unit)}

        <div class="card mt">
          <div class="card__head">${icon('users')}<h3>Status triase unit</h3>
            <span class="push"></span><span class="chip">${anggota.length} orang</span></div>
          ${anggota.length ? triaseBar(hitung('ok'), hitung('warn'), hitung('crit')) +
            (hitung('none') ? `<p class="tiny muted mt">${hitung('none')} anggota belum punya hasil ukur.</p>` : '')
            : '<p class="small muted">Belum ada anggota. Bagikan kode unit di atas.</p>'}
          <p class="tiny muted mt">Dari hasil ukur TeleBand terakhir tiap anggota.</p>
        </div>

        <div class="card mt">
          <div class="card__head">${icon('chart')}<h3>Hasil ukur 7 hari terakhir</h3>
            <span class="push"></span><span class="chip">${hari.reduce((a, h) => a + h.n, 0)} hasil</span></div>
          ${hari.some((h) => h.n) ? '<div class="chart-wrap"><canvas id="cFac" style="height:150px"></canvas></div>'
            : '<p class="small muted">Belum ada pengukuran anggota dalam 7 hari terakhir.</p>'}
        </div>

        <div class="section-title">${icon('alert')} Perlu tindak lanjut
          <span class="push"></span><a class="link" href="#/faskes/anggota">Semua anggota</a></div>
        ${perhatian.length ? `<div class="list">${perhatian.map((a) => barisPasienNyata(a, '#/faskes/anggota/')).join('')}</div>`
          : `<div class="card"><p class="small muted tc" style="padding:16px">
            Tidak ada anggota yang memerlukan tindak lanjut saat ini.</p></div>`}

        <div class="section-title">${icon('sparkle')} Kelola unit</div>
        <div class="quick">
          <a href="#/faskes/anggota"><i style="background:#EDF9F2;color:#03804C">${icon('users')}</i>Anggota</a>
          <a href="#/faskes/perangkat"><i style="background:#DCEEF9;color:#075A85">${icon('watch')}</i>Perangkat</a>
          <a href="#/faskes/nakes"><i style="background:#EEEBFD;color:#4A3BB8">${icon('stetho')}</i>Nakes</a>
          <a href="#/notifikasi"><i style="background:#FFF1D6;color:#8A5D00">${icon('bell')}</i>Peringatan</a>
        </div>

        <div class="promo mt2">
          <svg class="promo__deco" viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="86" stroke="#fff" stroke-width="2"/>
            <circle cx="100" cy="100" r="58" stroke="#fff" stroke-width="2" stroke-dasharray="4 8"/></svg>
          <h3>Laporan unit</h3>
          <p>Rekap anggota beserta hasil ukur TeleBand terakhirnya dan jumlah pengukuran 30 hari,
             dalam berkas CSV untuk pelaporan internal.</p>
          <button class="btn btn--soft btn--sm" data-report>${icon('doc')} Unduh laporan</button>
        </div>
      `);

      const cv = $('#cFac');
      if (cv) TC.barChart(cv, hari.map((h) => h.n), hari.map((h) => h.label), '#6C5CE7');
      $('[data-notif]').onclick = () => Router.navigate('/notifikasi');
      pasangKodeUnit(unit);
      $('[data-report]').onclick = () => laporanUnit(unit, anggota);
    }).catch(galatUnit);
  }

  /** Laporan CSV dari data nyata unit. */
  function laporanUnit(unit, anggota) {
    const baris = [];
    const kutip = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const tulis = (arr) => baris.push(arr.map(kutip).join(','));
    const batas30 = Date.now() - 30 * HARI;
    tulis(['Laporan unit TeleCare']);
    tulis(['Unit', unit.name, 'Jenis', unit.kind, 'Kota', unit.city]);
    tulis(['Disusun', TC.fullDate(new Date()) + ' ' + hhmm(Date.now())]);
    tulis(['Sumber: hasil ukur TeleBand anggota di server. Tekanan darah & glukosa = estimasi eksperimental.']);
    tulis([]);
    tulis(['Nama', 'Anggota sejak', 'Status', 'Hasil terakhir', 'Detak (bpm)', 'SpO2 (%)',
           'TD estimasi', 'Glukosa estimasi', 'Hasil ukur 30 hari', 'Penandaan eskalasi (perangkat ini)']);
    anggota.forEach((a) => {
      const r = a.terakhir;
      tulis([
        a.nama, shortDate(new Date(a.sejak)), metaStatus(a.status).t,
        r ? shortDate(new Date(r.t)) + ' ' + hhmm(new Date(r.t)) : '',
        r ? r.bpm : '', r ? r.spo2 : '',
        r && r.sis != null && r.dia != null ? r.sis + '/' + r.dia : '', r ? r.glukosa : '',
        a.hasil.filter((h) => h.t >= batas30).length,
        Store.escalationsFor(a.id).length
      ]);
    });
    const blob = new Blob(['\ufeff' + baris.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const el = document.createElement('a');
    el.href = URL.createObjectURL(blob);
    el.download = 'laporan-unit-' + kunciTanggal() + '.csv';
    el.click();
    setTimeout(() => URL.revokeObjectURL(el.href), 1000);
    toast('Laporan tersusun · ' + anggota.length + ' anggota.');
  }

  function viewFacilityMembersNyata() {
    TC.topbar('Anggota Unit', { sub: 'Memuat…', back: false });
    setView(`<p class="small muted tc" style="padding:24px">Memuat anggota…</p>`);
    muatUnit().then((d) => {
      if (!d.unit) { Router.navigate('/faskes', true); return; }
      TC.topbar('Anggota Unit', { sub: d.unit.name, back: false });
      setView(`
        <div class="searchbar">${icon('search')}
          <input id="mq" type="search" placeholder="Cari nama anggota" aria-label="Cari anggota"></div>
        <div class="list mt" id="mList"></div>`);
      function draw(q) {
        const list = d.anggota.filter((a) => !q || a.nama.toLowerCase().indexOf(q) !== -1)
          .sort((a, b) => URUT_STATUS[a.status] - URUT_STATUS[b.status]);
        $('#mList').innerHTML = list.length ? list.map((a) => barisPasienNyata(a, '#/faskes/anggota/')).join('')
          : `<div class="empty" style="background:var(--surface)">${icon('users')}
             <b>${d.anggota.length ? 'Tidak ditemukan' : 'Belum ada anggota'}</b>
             <p>${d.anggota.length ? 'Coba kata kunci lain.' : 'Bagikan kode unit dari layar Unit.'}</p></div>`;
      }
      draw('');
      $('#mq').oninput = (e) => draw(e.target.value.trim().toLowerCase());
    }).catch(galatUnit);
  }

  function viewFacilityDevicesNyata() {
    TC.topbar('Perangkat Unit', { sub: 'Memuat…', back: false });
    setView(`<p class="small muted tc" style="padding:24px">Memuat perangkat…</p>`);
    muatUnit().then((d) => {
      if (!d.unit) { Router.navigate('/faskes', true); return; }
      TC.topbar('Perangkat Unit', { sub: d.unit.name, back: false });
      const nama = {};
      d.anggota.forEach((a) => { nama[a.id] = a.nama; });
      // Inventaris disusun dari hasil ukur: setiap TeleBand (serial) yang
      // pernah mengirim hasil milik anggota unit ini.
      const alat = {};
      const batas7 = Date.now() - 7 * HARI;
      d.rows.forEach((r) => {
        const x = alat[r.device_serial] = alat[r.device_serial] ||
          { serial: r.device_serial, unit: r.device_unit, firmware: r.firmware, terakhir: 0, n7: 0, n: 0, pemakai: {} };
        const t = waktuBaris(r);
        x.n++;
        if (t >= batas7) x.n7++;
        if (t > x.terakhir) { x.terakhir = t; x.firmware = r.firmware || x.firmware; x.unit = r.device_unit || x.unit; }
        x.pemakai[r.user_id] = true;
      });
      const daftar = Object.values(alat).sort((a, b) => b.terakhir - a.terakhir);
      const aktif = daftar.filter((x) => x.terakhir >= batas7).length;

      setView(`
        <div class="stat-row">
          <div><b>${daftar.length}</b><span>TeleBand terpakai</span></div>
          <div><b>${aktif}</b><span>Aktif 7 hari</span></div>
          <div><b>${daftar.reduce((a, x) => a + x.n7, 0)}</b><span>Hasil 7 hari</span></div>
        </div>

        <div class="section-title">${icon('watch')} TeleBand anggota</div>
        ${daftar.length ? `<div class="stack--sm stack">${daftar.map((x) => `
          <div class="dev-card${x.terakhir >= batas7 ? ' is-on' : ''}">
            <span class="dev-card__ico">${icon('watch')}</span>
            <span style="min-width:0;flex:1">
              <b>TeleBand${x.unit ? ' · unit ' + esc(String(x.unit)) : ''}</b>
              <small class="mono">${esc(x.serial)}${x.firmware ? ' · fw ' + esc(x.firmware) : ''}</small>
              <span class="meta">
                <span class="chip" style="font-size:.66rem">${esc(relTime(x.terakhir))}</span>
                <span class="chip" style="font-size:.66rem">${x.n} hasil</span>
                <span class="chip" style="font-size:.66rem">${esc(Object.keys(x.pemakai).map((id) => nama[id] || '?').join(', '))}</span>
              </span>
            </span>
          </div>`).join('')}</div>`
          : `<div class="card"><p class="small muted tc" style="padding:16px">Belum ada TeleBand yang
             mengirim hasil ukur anggota unit ini.</p></div>`}

        <div class="note note--i mt2">${icon('info')}
          <div><b>Tercatat otomatis</b>Daftar ini disusun dari hasil ukur yang dikirim anggota —
          setiap TeleBand yang dipakai anggota muncul di sini beserta waktu pemakaian terakhirnya.</div></div>
      `);
    }).catch(galatUnit);
  }

  function viewFacilityStaffNyata() {
    TC.topbar('Tenaga Kesehatan', { sub: 'Memuat…', back: false });
    setView(`<p class="small muted tc" style="padding:24px">Memuat nakes…</p>`);
    muatUnit().then((d) => {
      if (!d.unit) { Router.navigate('/faskes', true); return; }
      TC.topbar('Tenaga Kesehatan', { sub: d.unit.name, back: false });
      setView(`
        ${d.nakes.length ? `<div class="list">${d.nakes.map((n) => `
          <div class="row">
            <span class="avatar" style="background:#0E7FB8">${esc(initials(n.member_name))}</span>
            <div style="min-width:0"><b>${esc(n.member_name)}</b>
              <small>Bergabung ${esc(shortDate(new Date(n.created_at)))}</small></div>
            <button class="btn btn--dangerSoft btn--sm" style="margin-left:auto" data-keluarkan="${esc(n.user_id)}"
              data-nama="${esc(n.member_name)}">Keluarkan</button>
          </div>`).join('')}</div>`
          : `<div class="empty">${icon('stetho')}<b>Belum ada nakes</b>
             <p>Dokter bergabung dengan memasukkan kode unit di Profil → Unit saya.</p></div>`}

        <div class="note note--i mt2">${icon('info')}
          <div><b>Menambah nakes</b>Bagikan kode unit dari layar Unit ke dokter. Akun berperan dokter
          yang memasukkannya tercatat sebagai nakes, akun berperan pasien sebagai anggota.</div></div>
      `);
      $$('[data-keluarkan]').forEach((b) => {
        b.onclick = async () => {
          const ok = await confirmSheet({ title: 'Keluarkan ' + b.dataset.nama + '?',
            body: 'Ia tidak lagi tercatat sebagai nakes unit ini.', ok: 'Keluarkan', danger: true });
          if (!ok) return;
          try { await TC.FacilityDB.keluarkan(d.unit.id, b.dataset.keluarkan); toast('Nakes dikeluarkan.'); Router.render(); }
          catch (e) { toast(pesanGalat(e, FILE_UNIT), 'err'); }
        };
      });
    }).catch(galatUnit);
  }

  /* ============================================================
     1. DOKTER — beranda klinik
     ============================================================ */
  function viewClinic() {
    if (!TC.FITUR.simulasi) { viewClinicNyata(); return; }
    const u = Store.user();
    const doc = D.doctor(u.doctorId) || D.DOCTORS[0];
    const consults = Store.state.consults;
    const active = consults.filter((c) => c.status === 'active');
    const attention = D.PATIENTS.filter((p) => p.status !== 'ok');
    const online = Store.state.settings.doctorOnline !== false;
    const K = TC.FITUR.konsultasi;   // bagian konsultasi & janji temu disembunyikan bila mati

    setTopbar('');
    setView(`
      <div class="hero-head">
        <span class="avatar avatar--lg" style="background:${doc.color};border-radius:18px">
          ${esc(initials(doc.name))}</span>
        <div style="min-width:0">
          <b>${esc(greeting(new Date()))}, ${esc(u.nickname || doc.name)}</b>
          <small>${esc(D.spec(doc.spec).name)} · ${esc(doc.hospital)}</small>
        </div>
        <button class="icon-btn" data-notif style="margin-left:auto" aria-label="Notifikasi">
          ${icon('bell')}</button>
      </div>

      ${K ? `<div class="card">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="row__ico" style="background:${online ? 'var(--green-50)' : 'var(--canvas-2)'};
            color:${online ? 'var(--green-600)' : 'var(--faint)'}">${icon('stetho')}</span>
          <div style="min-width:0">
            <b style="font-size:.95rem">${online ? 'Menerima konsultasi' : 'Sedang tidak menerima'}</b>
            <small class="muted" style="display:block;font-size:.78rem">
              ${online ? 'Pasien dapat memulai percakapan dengan Anda' : 'Anda tidak muncul sebagai online'}</small>
          </div>
          <label style="margin-left:auto;display:flex;align-items:center">
            <input type="checkbox" id="tOnline" ${online ? 'checked' : ''}
                   style="width:22px;height:22px;accent-color:var(--green-500)"></label>
        </div>
      </div>` : ''}

      <div class="stat-row mt">
        ${K ? `<div><b>${active.length}</b><span>Antrean aktif</span></div>` : ''}
        <div><b>${D.PATIENTS.length}</b><span>Pasien binaan</span></div>
        ${K ? `<div><b>${Store.state.appointments.length}</b><span>Janji temu</span></div>`
            : `<div><b>${attention.length}</b><span>Perlu perhatian</span></div>`}
      </div>

      ${K ? `<div class="section-title">${icon('inbox')} Antrean konsultasi
        <span class="push"></span><a class="link" href="#/klinik/antrean">Lihat semua</a></div>
      ${active.length ? `<div class="list">${active.slice(0, 4).map((c) => {
        const last = c.messages[c.messages.length - 1];
        return `<a class="row" href="#/chat/${esc(c.id)}">
          <span class="avatar" style="background:var(--green-500)">${esc(initials('Pasien ' + c.id.slice(-2)))}</span>
          <div style="min-width:0"><b>Pasien · ${esc(c.id.slice(-4).toUpperCase())}</b>
            <small style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(last ? (last.text || '[lampiran data]') : '')}</small></div>
          <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
            <span class="chip chip--g"><i class="dotlive"></i> ${esc(relTime(c.startedAt))}</span>
            ${icon('chev', 'chev')}</span>
        </a>`;
      }).join('')}</div>` : `
        <div class="card"><div class="empty" style="padding:24px 10px">${icon('inbox')}
          <b>Antrean kosong</b><p>Konsultasi yang masuk akan muncul di sini.</p></div></div>`}` : ''}

      <div class="section-title">${icon('alert')} Pasien perlu perhatian
        <span class="push"></span><span class="chip chip--a">${attention.length}</span></div>
      <div class="list">
        ${attention.map((p) => patientRow(p, '#/klinik/pasien/' + p.id)).join('')}
      </div>

      ${K ? `<div class="card mt">
        <div class="card__head">${icon('chart')}<h3>Konsultasi 7 hari terakhir</h3>
          <span class="push"></span><span class="chip">angka contoh</span></div>
        <div class="chart-wrap"><canvas id="cDocWeek" style="height:150px"></canvas></div>
        <p class="tiny muted mt">Antrean dan pasien binaan di atas berasal dari percakapan
          sungguhan dan katalog purwarupa; grafik ini belum terhubung ke keduanya.</p>
      </div>

      <div class="section-title">${icon('cal')} Janji temu terdekat</div>
      ${Store.state.appointments.length ? `<div class="list">
        ${Store.state.appointments.slice(0, 3).map((a) => `
          <div class="row"><span class="row__ico">${icon('cal')}</span>
            <div><b>${esc(shortDate(new Date(a.at)))} · ${esc(a.slot)}</b>
              <small>${esc(a.note || 'Tanpa catatan keluhan')}</small></div></div>`).join('')}
      </div>` : `<div class="card"><p class="small muted tc" style="padding:14px">Belum ada janji temu terjadwal.</p></div>`}` : ''}
    `);

    const w = series7('docWeek', 3, 18);
    const cWeek = $('#cDocWeek');
    if (cWeek) TC.barChart(cWeek, w.map((d) => d.v), w.map((d) => d.label), '#0E7FB8');

    const tOnline = $('#tOnline');
    if (tOnline) tOnline.onchange = (e) => {
      Store.update((s) => { s.settings.doctorOnline = e.target.checked; });
      // Status jaga di server ikut berubah: kalau tidak, pasien masih dapat
      // mendering perangkat yang pemiliknya sudah menyatakan tidak menerima.
      if (TC.segarkanJaga) TC.segarkanJaga();
      toast(e.target.checked ? 'Anda kini menerima konsultasi.' : 'Status diubah menjadi tidak menerima.');
      Router.render();
    };
    $('[data-notif]').onclick = () => Router.navigate('/notifikasi');
  }

  /* ---------------- Dokter · antrean ---------------- */
  function viewQueue() {
    TC.topbar('Antrean Konsultasi', { sub: 'Percakapan masuk dan riwayat', back: false });
    const all = Store.state.consults;
    setView(`
      <div class="seg">
        <button data-q="aktif" class="is-active">Aktif</button>
        <button data-q="selesai">Selesai</button>
      </div>
      <div id="qBody" class="mt"></div>`);

    function draw(kind) {
      const list = all.filter((c) => (kind === 'aktif' ? c.status === 'active' : c.status !== 'active'));
      $('#qBody').innerHTML = list.length ? `<div class="list">${list.map((c) => {
        const last = c.messages[c.messages.length - 1];
        return `<a class="row" href="#/chat/${esc(c.id)}">
          <span class="avatar" style="background:var(--green-500)">${esc(initials('Pasien ' + c.id.slice(-2)))}</span>
          <div style="min-width:0"><b>Pasien · ${esc(c.id.slice(-4).toUpperCase())}</b>
            <small style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${esc(last ? (last.text || '[lampiran data]') : '')}</small>
            <small class="tiny" style="color:var(--faint)">${esc(relTime(c.startedAt))} · ${esc(c.mode)}</small></div>
          ${icon('chev', 'chev')}</a>`;
      }).join('')}</div>` : `
        <div class="empty">${icon('inbox')}<b>Tidak ada percakapan</b>
        <p>${kind === 'aktif' ? 'Belum ada konsultasi yang sedang berlangsung.' : 'Belum ada konsultasi yang selesai.'}</p></div>`;
    }
    draw('aktif');
    $$('[data-q]').forEach((b) => {
      b.onclick = () => {
        $$('[data-q]').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        draw(b.dataset.q);
      };
    });
  }

  /* ---------------- Dokter · daftar pasien ---------------- */
  function viewPatients() {
    if (!TC.FITUR.simulasi) { viewPatientsNyata(); return; }
    TC.topbar('Pasien Binaan', { sub: D.PATIENTS.length + ' orang terpantau', back: false });
    setView(`
      <div class="searchbar">${icon('search')}
        <input id="pq" type="search" placeholder="Cari nama atau unit" aria-label="Cari pasien"></div>
      <div class="seg mt">
        <button data-f="all" class="is-active">Semua</button>
        <button data-f="crit">Kritis</button>
        <button data-f="warn">Waspada</button>
        <button data-f="ok">Normal</button>
      </div>
      <div class="list mt" id="pList"></div>`);

    let filter = 'all', q = '';
    function draw() {
      const list = D.PATIENTS.filter((p) => {
        if (filter !== 'all' && p.status !== filter) return false;
        if (!q) return true;
        return (p.name + ' ' + p.unit).toLowerCase().indexOf(q) !== -1;
      });
      $('#pList').innerHTML = list.length
        ? list.map((p) => patientRow(p, '#/klinik/pasien/' + p.id)).join('')
        : `<div class="empty" style="background:var(--surface)">${icon('search')}
           <b>Tidak ditemukan</b><p>Coba kata kunci atau filter lain.</p></div>`;
    }
    draw();
    $('#pq').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
    $$('[data-f]').forEach((b) => {
      b.onclick = () => {
        $$('[data-f]').forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        filter = b.dataset.f; draw();
      };
    });
  }

  /* ---------------- Dokter · detail pasien ---------------- */

  const MODE_LABEL = { chat: 'Chat', audio: 'Panggilan suara', video: 'Panggilan video' };

  function gambarRiwayat(riwayat) {
    if (!riwayat.length) {
      return `<div class="empty">${icon('stetho')}<b>Belum ada konsultasi</b>
        <p>Konsultasi yang Anda mulai dari halaman ini akan tercatat di sini.</p></div>`;
    }
    return `<div class="list">${riwayat.map((c) => {
      const doc = D.doctor(c.doctorId);
      const selesai = c.status !== 'active';
      const jml = (c.messages || []).length;
      return `<a class="row" href="#/chat/${esc(c.id)}">
        <span class="row__ico">${icon(c.mode === 'chat' ? 'chat' : 'video')}</span>
        <div style="min-width:0">
          <b>${esc(MODE_LABEL[c.mode] || 'Konsultasi')}${doc ? ' · ' + esc(doc.name) : ''}</b>
          <small>${esc(shortDate(c.startedAt))} · ${jml} pesan${
            c.note ? ' · ' + esc(c.note) : ''}</small>
        </div>
        <span style="margin-left:auto" class="chip ${selesai ? '' : 'chip--g'}">${
          selesai ? 'selesai' : 'aktif'}</span>
      </a>`;
    }).join('')}</div>`;
  }

  /**
   * Daftar penandaan eskalasi pasien. Sebelumnya tombol "Tandai eskalasi" hanya
   * memunculkan notifikasi lalu tidak meninggalkan jejak apa pun, sehingga
   * tampak bekerja padahal tidak.
   */
  function gambarEskalasi(patientId) {
    const list = Store.escalationsFor(patientId);
    if (!list.length) {
      return `<div class="card"><p class="small muted tc" style="padding:14px">
        Belum ditandai untuk tindak lanjut.</p></div>`;
    }
    return `<div class="list">${list.map((e) => `
      <div class="row">
        <span class="row__ico" style="background:var(--amber-50);color:var(--amber-700)">
          ${icon('alert')}</span>
        <div style="min-width:0">
          <b style="font-size:.87rem">Ditandai perlu tindak lanjut</b>
          <small>${esc(shortDate(e.at))} · ${esc(hhmm(e.at))} · ${esc(relTime(e.at))}${
            e.by ? ' · ' + esc(e.by) : ''}</small>
        </div>
        <button class="icon-btn" data-esc-del="${esc(e.id)}"
          aria-label="Hapus penandaan" title="Hapus penandaan">${icon('trash')}</button>
      </div>`).join('')}</div>`;
  }

  function gambarCatatan(patientId, bolehHapus) {
    const notes = TC.Notes.list(patientId);
    if (!notes.length) {
      return `<div class="empty">${icon('doc')}<b>Belum ada catatan klinis</b>
        <p>Catatan yang tersimpan akan tampil di sini, terbaru lebih dulu.</p></div>`;
    }
    return `<div class="list">${notes.map((n) => `
      <div class="row" style="align-items:flex-start">
        <span class="row__ico">${icon('doc')}</span>
        <div style="min-width:0;flex:1">
          <b style="font-size:.87rem">${esc(n.author)}${
            n.role ? ' · ' + esc(D.role(n.role).name) : ''}</b>
          <small class="tiny muted" style="display:block">${esc(shortDate(n.at))} ·
            ${esc(hhmm(n.at))} · ${esc(relTime(n.at))}</small>
          <p class="small" style="margin:.5rem 0 0;white-space:pre-wrap;color:var(--ink-2)">${esc(n.text)}</p>
        </div>
        ${bolehHapus ? `<button class="icon-btn" data-note-del="${esc(n.id)}"
          aria-label="Hapus catatan" title="Hapus catatan">${icon('trash')}</button>` : ''}
      </div>`).join('')}</div>`;
  }

  function viewPatientDetail(params) {
    if (!TC.FITUR.simulasi && (Store.is('dokter') || Store.is('admin-faskes'))) { viewPatientDetailNyata(params); return; }
    const p = D.patient(params.id);
    if (!p) {
      // Layar ini dipakai dua peran; mengembalikan ke daftar milik peran lain
      // akan tertahan penjaga rute lalu memantul ke beranda.
      Router.navigate(Store.is('admin-faskes') ? '/faskes/anggota' : '/klinik/pasien', true);
      return;
    }
    const m = D.STATUS_META[p.status];
    const fac = D.facility(p.fac);
    const riwayat = TC.Consult.forPatient(p.id);
    const eskalasi = Store.escalationsFor(p.id);
    // Admin faskes memakai layar yang sama lewat /faskes/anggota/:id, tetapi
    // bukan klinisi — catatan klinis dibuka baca saja untuknya.
    const bolehMenulis = Store.is('dokter');

    TC.topbar(p.name, { sub: p.unit });
    setView(`
      <div class="card" style="display:flex;gap:14px;align-items:center">
        <span class="avatar avatar--lg" style="background:${m.color}">${esc(initials(p.name))}</span>
        <div style="min-width:0">
          <b style="font-size:1rem">${esc(p.name)}</b>
          <small class="muted" style="display:block;font-size:.8rem">
            ${p.age} tahun · ${p.sex === 'P' ? 'Perempuan' : 'Laki-laki'}</small>
          <small class="tiny muted">${esc(fac.name)}</small>
        </div>
        <span style="margin-left:auto">${statusChip(p.status)}</span>
      </div>

      <div class="vital-grid mt">
        <div class="vital vital--hr"><span class="vital__lab">${icon('heart')} Detak jantung</span>
          <span class="vital__val">${p.hr}<u>bpm</u></span></div>
        <div class="vital vital--spo"><span class="vital__lab">${icon('spo2')} SpO₂</span>
          <span class="vital__val">${p.spo2}<u>%</u></span></div>
        <div class="vital vital--tmp"><span class="vital__lab">${icon('temp')} Suhu</span>
          <span class="vital__val">${p.temp}<u>°C</u></span></div>
        <div class="vital vital--bp"><span class="vital__lab">${icon('bp')} Tekanan darah</span>
          <span class="vital__val">${p.sys}/${p.dia}</span></div>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('chart')}<h3>Detak jantung istirahat · 7 hari</h3></div>
        <div class="chart-wrap"><canvas id="cPat" style="height:150px"></canvas></div>
      </div>

      <div class="note note--${p.status === 'crit' ? 'd' : p.status === 'warn' ? 'w' : 'i'} mt">
        ${icon(p.status === 'ok' ? 'info' : 'alert')}
        <div><b>Catatan pemantauan</b>${esc(p.note)}</div></div>

      <div class="list mt">
        <div class="row"><span class="row__ico">${icon('watch')}</span>
          <div><b>Perangkat</b><small>${esc(p.device)} · sinkron ${esc(relTime(Date.now() - 3600000))}</small></div></div>
        <div class="row"><span class="row__ico">${icon('building')}</span>
          <div><b>Unit</b><small>${esc(fac.name)} · ${esc(fac.city)}</small></div></div>
      </div>

      ${TC.FITUR.konsultasi ? `<div class="section-title">${icon('stetho')} Riwayat konsultasi
        <span class="push"></span>
        <span class="chip">${riwayat.length}</span></div>
      <div id="patRiwayat">${gambarRiwayat(riwayat)}</div>` : ''}

      <div class="section-title">${icon('doc')} Catatan klinis
        <span class="push"></span>
        <span class="chip" data-note-count>${TC.Notes.count(p.id)}</span></div>

      ${bolehMenulis ? `
        <div class="card">
          <label class="field">
            <span>Catatan baru</span>
            <textarea id="noteText" rows="4" maxlength="4000"
              placeholder="Temuan pemeriksaan, penilaian, dan rencana tindak lanjut…"></textarea>
            <small>Setelah disimpan, isi catatan tidak dapat diubah — hanya dihapus.</small>
          </label>
          <button class="btn btn--primary btn--block mt" data-note-save>
            ${icon('check')} Simpan catatan</button>
        </div>` : `
        <div class="note note--i">${icon('info')}
          <div><b>Hanya dapat dibaca</b>Catatan klinis ditulis oleh dokter. Peran Anda
          (${esc(D.role(Store.role()).name)}) dapat membacanya tetapi tidak menambahkannya.</div></div>`}

      <div id="patNotes" class="mt">${gambarCatatan(p.id, bolehMenulis)}</div>

      <div class="section-title">${icon('alert')} Penandaan eskalasi
        <span class="push"></span>
        <span class="chip" data-esc-count>${eskalasi.length}</span></div>
      <div id="patEsk">${gambarEskalasi(p.id)}</div>

      <div class="${TC.FITUR.konsultasi ? 'grid2' : ''} mt2">
        ${TC.FITUR.konsultasi ? `<button class="btn btn--primary btn--block" data-chat>${icon('chat')} Mulai konsultasi</button>` : ''}
        <button class="btn btn--ghost btn--block" data-esc>${icon('alert')} Tandai eskalasi</button>
      </div>

      <div class="note note--w mt2">${icon('alert')}
        <div><b>Data contoh</b>Angka pada halaman ini adalah ilustrasi purwarupa, bukan rekam medis nyata.
        Catatan klinis tersimpan di peramban perangkat ini saja, belum dibagikan antar-dokter.</div></div>
    `);

    const w = series7('pat' + p.id, Math.max(50, p.hr - 12), p.hr + 6);
    TC.lineChart($('#cPat'), [{ data: w.map((d) => d.v), color: m.color, fill: true, dots: true }],
      { xLabels: w.map((d) => d.label) });

    /* ---------------- catatan klinis ---------------- */
    function segarkanCatatan() {
      const box = $('#patNotes');
      if (box) box.innerHTML = gambarCatatan(p.id, bolehMenulis);
      const c = $('[data-note-count]');
      if (c) c.textContent = TC.Notes.count(p.id);
      pasangHapus();
    }

    function pasangHapus() {
      if (!bolehMenulis) return;
      $$('[data-note-del]').forEach((b) => {
        b.onclick = async () => {
          const ok = await confirmSheet({
            title: 'Hapus catatan klinis?',
            body: 'Catatan yang dihapus tidak dapat dikembalikan.',
            ok: 'Hapus', danger: true
          });
          if (!ok) return;
          TC.Notes.remove(p.id, b.dataset.noteDel);
          segarkanCatatan();
          toast('Catatan dihapus.');
        };
      });
    }
    pasangHapus();

    if (bolehMenulis) {
      $('[data-note-save]').onclick = () => {
        const ta = $('#noteText');
        const isi = ta.value.trim();
        if (!isi) { toast('Catatan masih kosong.'); ta.focus(); return; }
        const u = Store.user();
        const penulis = (D.doctor(u && u.doctorId) || {}).name || (u && u.name) || 'Dokter';
        TC.Notes.add(p.id, isi, penulis, Store.role());
        ta.value = '';
        segarkanCatatan();
        toast('Catatan klinis disimpan.');
      };
    }

    const chatBtn = $('[data-chat]');
    if (chatBtn) chatBtn.onclick = () => {
      const doc = D.doctor(Store.user().doctorId) || D.DOCTORS[0];
      // patientId dikirim agar percakapan ini ikut terkumpul di riwayat pasien.
      const c = TC.Consult.start(doc.id, 'chat', p.id);
      TC.Consult.push(c.id, {
        from: 'doc',
        text: `Selamat siang ${p.name.split(' ')[0]}, saya melihat pemantauan Anda beberapa hari ini. ` +
              'Boleh ceritakan bagaimana kondisi yang Anda rasakan?'
      });
      Router.navigate('/chat/' + c.id);
    };
    /* ---------------- penandaan eskalasi ---------------- */
    function segarkanEskalasi() {
      const box = $('#patEsk');
      if (box) box.innerHTML = gambarEskalasi(p.id);
      const c = $('[data-esc-count]');
      if (c) c.textContent = Store.escalationsFor(p.id).length;
      pasangHapusEskalasi();
    }

    function pasangHapusEskalasi() {
      $$('[data-esc-del]').forEach((b) => {
        b.onclick = () => {
          Store.removeEscalation(b.dataset.escDel);
          segarkanEskalasi();
          toast('Penandaan dihapus.');
        };
      });
    }
    pasangHapusEskalasi();

    $('[data-esc]').onclick = () => {
      const u = Store.user();
      const oleh = (D.doctor(u && u.doctorId) || {}).name || (u && u.name) || null;
      Store.addEscalation(p.id, oleh);
      Store.notify('Eskalasi ditandai', p.name + ' · ' + p.unit, 'warn');
      segarkanEskalasi();
      toast('Pasien ditandai untuk tindak lanjut.');
    };
  }

  /* ============================================================
     2. ADMIN FASKES
     ============================================================ */
  function facilityOf(u) {
    return D.facility(u.facilityId || 'f1');
  }

  function viewFacility() {
    if (!TC.FITUR.simulasi) { viewFacilityNyata(); return; }
    const u = Store.user();
    const f = facilityOf(u);
    const members = D.PATIENTS.filter((p) => p.fac === f.id);
    const crit = f.critical, warn = f.warn;
    const ok = Math.max(0, f.members - crit - warn);

    setTopbar('');
    setView(`
      <div class="hero-head">
        <span class="avatar avatar--lg" style="background:#6C5CE7;border-radius:18px">
          ${icon(f.icon)}</span>
        <div style="min-width:0">
          <b>${esc(f.name)}</b>
          <small>${esc(f.kind)} · ${esc(f.city)} · paket ${esc(f.plan)}</small>
        </div>
        <button class="icon-btn" data-notif style="margin-left:auto" aria-label="Notifikasi">
          ${icon('bell')}</button>
      </div>

      <div class="note note--w">${icon('alert')}
        <div><b>Angka unit ini contoh</b>Jumlah anggota, perangkat, dan eskalasi berasal dari
        katalog purwarupa, bukan pendataan sungguhan. Yang benar-benar tersimpan di perangkat ini
        adalah catatan klinis dan penandaan eskalasi yang Anda buat sendiri.</div></div>

      <div class="stat-row mt">
        <div><b>${f.members}</b><span>Anggota</span></div>
        <div><b>${f.devices}</b><span>Perangkat</span></div>
        <div><b style="color:var(--coral-500)">${crit}</b><span>Eskalasi kritis</span></div>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('users')}<h3>Status triase unit</h3>
          <span class="push"></span><span class="chip">${f.members} orang</span></div>
        ${triaseBar(ok, warn, crit)}
      </div>

      <div class="card mt">
        <div class="card__head">${icon('chart')}<h3>Eskalasi 7 hari terakhir</h3></div>
        <div class="chart-wrap"><canvas id="cFac" style="height:150px"></canvas></div>
      </div>

      <div class="section-title">${icon('alert')} Perlu tindak lanjut
        <span class="push"></span><a class="link" href="#/faskes/anggota">Semua anggota</a></div>
      ${members.filter((p) => p.status !== 'ok').length ? `<div class="list">
        ${members.filter((p) => p.status !== 'ok').map((p) => patientRow(p, '#/faskes/anggota/' + p.id)).join('')}
      </div>` : `<div class="card"><p class="small muted tc" style="padding:16px">
        Tidak ada anggota yang memerlukan tindak lanjut saat ini.</p></div>`}

      <div class="section-title">${icon('sparkle')} Kelola unit</div>
      <div class="quick">
        <a href="#/faskes/anggota"><i style="background:#EDF9F2;color:#03804C">${icon('users')}</i>Anggota</a>
        <a href="#/faskes/perangkat"><i style="background:#DCEEF9;color:#075A85">${icon('watch')}</i>Perangkat</a>
        <a href="#/faskes/nakes"><i style="background:#EEEBFD;color:#4A3BB8">${icon('stetho')}</i>Nakes</a>
        <a href="#/notifikasi"><i style="background:#FFF1D6;color:#8A5D00">${icon('bell')}</i>Peringatan</a>
      </div>

      <div class="promo mt2">
        <svg class="promo__deco" viewBox="0 0 200 200" fill="none" aria-hidden="true">
          <circle cx="100" cy="100" r="86" stroke="#fff" stroke-width="2"/>
          <circle cx="100" cy="100" r="58" stroke="#fff" stroke-width="2" stroke-dasharray="4 8"/></svg>
        <h3>Laporan berkala unit</h3>
        <p>Rekap bulanan kondisi anggota, kepatuhan pemakaian perangkat, dan jumlah eskalasi
           dapat diunduh untuk kebutuhan pelaporan internal.</p>
        <button class="btn btn--soft btn--sm" data-report>${icon('doc')} Susun laporan</button>
      </div>
    `);

    const w = series7('facWeek', 2, 16);
    TC.lineChart($('#cFac'), [{ data: w.map((d) => d.v), color: '#6C5CE7', fill: true, dots: true }],
      { xLabels: w.map((d) => d.label) });

    $('[data-notif]').onclick = () => Router.navigate('/notifikasi');

    // Dulu tombol ini hanya memunculkan pesan "belum tersedia". Sekarang ia
    // benar-benar menyusun berkas: bagian yang nyata (penandaan eskalasi dan
    // catatan klinis yang dibuat di perangkat ini) dipisahkan tegas dari bagian
    // yang masih data contoh, supaya laporannya tidak menyesatkan pembacanya.
    $('[data-report]').onclick = () => susunLaporan(f, members);
  }

  /** Menyusun laporan unit sebagai berkas CSV yang dapat diunduh. */
  function susunLaporan(f, members) {
    const baris = [];
    const kutip = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const tulis = (arr) => baris.push(arr.map(kutip).join(','));

    tulis(['Laporan unit TeleCare']);
    tulis(['Unit', f.name]);
    tulis(['Jenis', f.kind, 'Kota', f.city, 'Paket', f.plan]);
    tulis(['Disusun', TC.fullDate(new Date()) + ' ' + hhmm(Date.now())]);
    tulis([]);
    tulis(['CATATAN: kolom vital dan jumlah anggota berasal dari data contoh purwarupa.',
           'Kolom penandaan eskalasi dan catatan klinis berisi data sungguhan',
           'yang dibuat pada perangkat ini.']);
    tulis([]);

    tulis(['Nama', 'Usia', 'Unit', 'Status', 'HR', 'SpO2', 'Suhu', 'Sistolik', 'Diastolik',
           'Perangkat', 'Penandaan eskalasi', 'Eskalasi terakhir', 'Catatan klinis']);
    members.forEach((p) => {
      const esk = Store.escalationsFor(p.id);
      tulis([
        p.name, p.age, p.unit, (D.STATUS_META[p.status] || {}).t || p.status,
        p.hr, p.spo2, p.temp, p.sys, p.dia, p.device,
        esk.length, esk.length ? TC.shortDate(esk[0].at) + ' ' + hhmm(esk[0].at) : '',
        TC.Notes.count(p.id)
      ]);
    });

    tulis([]);
    const totalEsk = members.reduce((a, p) => a + Store.escalationsFor(p.id).length, 0);
    const totalNote = members.reduce((a, p) => a + TC.Notes.count(p.id), 0);
    tulis(['Ringkasan data sungguhan']);
    tulis(['Anggota ditampilkan', members.length]);
    tulis(['Total penandaan eskalasi', totalEsk]);
    tulis(['Total catatan klinis', totalNote]);

    // BOM ditambahkan agar Excel membuka UTF-8 dengan benar.
    const blob = new Blob(['\ufeff' + baris.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'laporan-' + f.id + '-' + kunciTanggal() + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Laporan tersusun · ' + members.length + ' anggota, ' + totalEsk + ' eskalasi.');
  }

  function kunciTanggal() {
    const d = new Date();
    return d.getFullYear() + TC.pad2(d.getMonth() + 1) + TC.pad2(d.getDate());
  }

  function viewFacilityMembers() {
    if (!TC.FITUR.simulasi) { viewFacilityMembersNyata(); return; }
    const f = facilityOf(Store.user());
    TC.topbar('Anggota Unit', { sub: f.name, back: false });
    const members = D.PATIENTS.filter((p) => p.fac === f.id);
    setView(`
      <div class="searchbar">${icon('search')}
        <input id="mq" type="search" placeholder="Cari nama atau unit" aria-label="Cari anggota"></div>
      <div class="note note--i mt">${icon('info')}
        <div><b>${members.length} dari ${f.members} anggota</b>Purwarupa menampilkan sebagian data
        sebagai contoh; sisanya diwakili oleh angka ringkasan.</div></div>
      <div class="list mt" id="mList"></div>`);

    function draw(q) {
      const list = members.filter((p) => !q ||
        (p.name + ' ' + p.unit).toLowerCase().indexOf(q) !== -1);
      $('#mList').innerHTML = list.length
        ? list.map((p) => patientRow(p, '#/faskes/anggota/' + p.id)).join('')
        : `<div class="empty" style="background:var(--surface)">${icon('search')}
           <b>Tidak ditemukan</b><p>Coba kata kunci lain.</p></div>`;
    }
    draw('');
    $('#mq').oninput = (e) => draw(e.target.value.trim().toLowerCase());
  }

  function viewFacilityDevices() {
    if (!TC.FITUR.simulasi) { viewFacilityDevicesNyata(); return; }
    const f = facilityOf(Store.user());
    TC.topbar('Perangkat Unit', { sub: f.name, back: false });

    // Jumlah per jenis dibagi dari total perangkat unit memakai bobot tetap,
    // sehingga penjumlahannya selalu sama dengan angka "Perangkat" di dashboard
    // unit. Sebelumnya tiap jenis memakai deret acak lalu jenis pertama
    // ditambah 40 tanpa alasan, jadi totalnya tidak pernah cocok.
    //
    // battery dan synced memakai series7 supaya benar-benar stabil per hari.
    // Sebelumnya keduanya memakai TC.rint() yang dibangkitkan ulang setiap
    // render, sehingga kartu "Tersinkron" dan "Baterai rendah" berubah angkanya
    // setiap kali halaman disegarkan — padahal komentarnya menjanjikan stabil.
    const BOBOT = { band: 0.34, ring: 0.26, cuff: 0.12, patch: 0.10, strap: 0.10, scale: 0.08 };
    let sisa = f.devices;
    // Inventaris ini contoh; unit fisik sungguhan (`nyata`) tidak ikut dibagi.
    const JENIS = D.DEVICE_TYPES.filter((t) => !t.nyata);
    const inv = JENIS.map((t, i) => {
      const akhir = i === JENIS.length - 1;
      // Jenis terakhir mengambil sisanya agar pembulatan tidak menghilangkan unit.
      const count = akhir ? Math.max(0, sisa)
                          : Math.round(f.devices * (BOBOT[t.type] || 0.1));
      sisa -= count;
      return {
        t, count,
        battery: series7('bat-' + f.id + '-' + t.type, 46, 96)[6].v,
        synced: series7('syn-' + f.id + '-' + t.type, 88, 100)[6].v
      };
    });
    const total = inv.reduce((a, x) => a + x.count, 0);

    setView(`
      <div class="stat-row">
        <div><b>${total}</b><span>Perangkat</span></div>
        <div><b>${Math.round(inv.reduce((a, x) => a + x.synced, 0) / inv.length)}%</b><span>Tersinkron</span></div>
        <div><b>${inv.filter((x) => x.battery < 55).length}</b><span>Baterai rendah</span></div>
      </div>

      <div class="note note--w mt">${icon('alert')}
        <div><b>Angka contoh</b>Pembagian per jenis dihitung dari total perangkat unit memakai
        bobot tetap; baterai dan tingkat sinkronisasi dibangkitkan untuk purwarupa dan tetap
        sama sepanjang hari. Belum ada inventaris sungguhan yang terhubung.</div></div>

      <div class="section-title">${icon('watch')} Inventaris per jenis</div>
      <div class="stack--sm stack">
        ${inv.map((x) => `
          <div class="dev-card">
            <span class="dev-card__ico" style="background:var(--green-100);color:var(--green-600)">
              ${icon(x.t.icon)}</span>
            <span style="min-width:0;flex:1">
              <b>${esc(x.t.name)}</b><small>${esc(x.t.tagline)}</small>
              <span class="meta">
                <span class="chip" style="font-size:.66rem">${x.count} unit</span>
                <span class="chip ${x.battery < 55 ? 'chip--a' : 'chip--g'}" style="font-size:.66rem">
                  ${icon('battery')} rata-rata ${x.battery}%</span>
                <span class="chip" style="font-size:.66rem">${x.synced}% sinkron</span>
              </span>
            </span>
          </div>`).join('')}
      </div>

      <div class="card mt2">
        <div class="card__head">${icon('sync')}<h3>Kepatuhan sinkronisasi 7 hari</h3></div>
        <div class="chart-wrap"><canvas id="cSync" style="height:150px"></canvas></div>
        <p class="tiny muted mt">Persentase perangkat yang menyinkronkan datanya minimal sekali sehari.</p>
      </div>
    `);
    const w = series7('syncWeek', 78, 99);
    TC.barChart($('#cSync'), w.map((d) => d.v), w.map((d) => d.label), '#049A5B');
  }

  function viewFacilityStaff() {
    if (!TC.FITUR.simulasi) { viewFacilityStaffNyata(); return; }
    const f = facilityOf(Store.user());
    TC.topbar('Tenaga Kesehatan', { sub: f.name, back: false });
    const staff = D.DOCTORS.slice(0, f.staff);
    setView(`
      <div class="note note--w">${icon('alert')}
        <div><b>Daftar contoh</b>Nakes di bawah diambil dari katalog dokter purwarupa; belum ada
        penugasan sungguhan antara tenaga kesehatan dan unit ini.</div></div>

      <div class="stack mt">
        ${staff.map((doc) => `
          <div class="doc">
            <span class="doc__av">
              <span class="avatar" style="background:${doc.color}">${esc(initials(doc.name))}</span>
              <i class="st${doc.online ? ' on' : ''}"></i></span>
            <span class="doc__body">
              <b>${esc(doc.name)}</b>
              <span class="spec-name">${esc(D.spec(doc.spec).name)}</span>
              <span class="meta">
                <span>${icon('star')} ${doc.rating}</span>
                <span>${icon('doc')} ${doc.exp} thn</span>
                <span>${icon('clock')} ${esc(doc.wait)}</span></span>
            </span>
          </div>`).join('')}
      </div>

      <div class="note note--i mt2">${icon('info')}
        <div><b>Penugasan nakes memerlukan sisi server</b>Mengundang atau menugaskan tenaga
        kesehatan ke sebuah unit menuntut direktori pengguna tepercaya, yang belum ada pada
        purwarupa ini.</div></div>
    `);
  }

  /* ============================================================
     3. ADMIN PLATFORM
     ============================================================ */
  function viewSystem() {
    const users = Object.values(Store.state.users);
    const totalMembers = D.FACILITIES.reduce((a, f) => a + f.members, 0);
    const totalDevices = D.FACILITIES.reduce((a, f) => a + f.devices, 0);
    // Daftar menunggu verifikasi diturunkan dari data dan dari apa yang sudah
    // pernah diverifikasi di perangkat ini, sehingga lencana dan daftarnya
    // tidak mungkin lepas sinkron.
    const kandidat = D.DOCTORS.filter((d) => d.verified === false);
    const sudahDiverifikasi = kandidat.filter((d) => Store.isVerified(d.id));
    const menunggu = kandidat.filter((d) => !Store.isVerified(d.id));

    setTopbar('');
    setView(`
      <div class="hero-head">
        <span class="avatar avatar--lg" style="background:#E09B12;border-radius:18px">
          ${icon('shield')}</span>
        <div style="min-width:0">
          <b>Ringkasan Platform</b>
          <small>${esc(TC.fullDate(new Date()))}</small>
        </div>
        <button class="icon-btn" data-notif style="margin-left:auto" aria-label="Notifikasi">
          ${icon('bell')}</button>
      </div>

      <div class="vital-grid">
        <div class="vital"><span class="vital__lab">${icon('users')} Pengguna</span>
          <span class="vital__val">${totalMembers.toLocaleString('id-ID')}</span></div>
        <div class="vital"><span class="vital__lab">${icon('stetho')} Dokter</span>
          <span class="vital__val">${D.DOCTORS.length}</span></div>
        <div class="vital"><span class="vital__lab">${icon('building')} Faskes</span>
          <span class="vital__val">${D.FACILITIES.length}</span></div>
        <div class="vital"><span class="vital__lab">${icon('watch')} Perangkat</span>
          <span class="vital__val">${totalDevices.toLocaleString('id-ID')}</span></div>
      </div>

      ${TC.FITUR.konsultasi ? `<div class="card mt">
        <div class="card__head">${icon('chart')}<h3>Konsultasi harian platform</h3></div>
        <div class="chart-wrap"><canvas id="cSys" style="height:160px"></canvas></div>
      </div>` : ''}

      <div class="section-title">${icon('verify')} Menunggu verifikasi
        <span class="push"></span>
        <span class="chip ${menunggu.length ? 'chip--a' : 'chip--g'}">${menunggu.length}</span></div>
      ${menunggu.length ? `<div class="list">
        ${menunggu.map((doc) => `
          <div class="row">
            <span class="avatar" style="background:${doc.color}">${esc(initials(doc.name))}</span>
            <div style="min-width:0"><b>${esc(doc.name)}</b>
              <small>${esc(D.spec(doc.spec).name)} · ${esc(doc.hospital)}</small></div>
            <button class="btn btn--soft btn--sm" style="margin-left:auto"
                    data-verify="${doc.id}">Verifikasi</button>
          </div>`).join('')}
      </div>` : `<div class="card"><p class="small muted tc" style="padding:16px">
        Semua mitra sudah terverifikasi.${sudahDiverifikasi.length
          ? ` Diverifikasi dari perangkat ini: ${sudahDiverifikasi.length}.` : ''}</p></div>`}

      <div class="section-title">${icon('building')} Faskes teratas</div>
      <div class="list">
        ${D.FACILITIES.map((f) => `
          <a class="row" href="#/sistem/faskes">
            <span class="row__ico">${icon(f.icon)}</span>
            <div style="min-width:0"><b>${esc(f.name)}</b>
              <small>${esc(f.kind)} · ${f.members} anggota · ${esc(f.city)}</small></div>
            <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
              ${f.critical ? `<span class="chip chip--r">${f.critical} kritis</span>` : statusChip('ok')}
              ${icon('chev', 'chev')}</span>
          </a>`).join('')}
      </div>

      <div class="section-title">${icon('sparkle')} Kelola</div>
      <div class="quick">
        <a href="#/sistem/pengguna"><i style="background:#EDF9F2;color:#03804C">${icon('users')}</i>Pengguna</a>
        <a href="#/sistem/dokter"><i style="background:#DCEEF9;color:#075A85">${icon('stetho')}</i>Dokter</a>
        <a href="#/sistem/faskes"><i style="background:#EEEBFD;color:#4A3BB8">${icon('building')}</i>Faskes</a>
        <a href="#/sistem/kalibrasi"><i style="background:#E8F4FF;color:#0E7FB8">${icon('target')}</i>Kalibrasi</a>
      </div>

      <div class="note note--w mt2">${icon('alert')}
        <div><b>Angka contoh</b>Statistik pada layar ini dibangkitkan untuk purwarupa dan
        tidak mencerminkan penggunaan sesungguhnya. Akun lokal di perangkat ini: ${users.length}.</div></div>
    `);

    const w = series7('sysWeek', 120, 420);
    const cSys = $('#cSys');
    if (cSys) TC.lineChart(cSys, [{ data: w.map((d) => d.v), color: '#E09B12', fill: true, dots: true }],
      { xLabels: w.map((d) => d.label) });

    $('[data-notif]').onclick = () => Router.navigate('/notifikasi');
    $$('[data-verify]').forEach((b) => {
      b.onclick = () => {
        const doc = D.doctor(b.dataset.verify);
        // Disimpan, bukan hanya menimpa DOM: sebelumnya tombolnya muncul lagi
        // begitu layar dirender ulang, seolah verifikasinya tidak pernah terjadi.
        Store.verifyDoctor(doc.id);
        Store.notify('Dokter terverifikasi', doc.name, 'ok');
        toast(doc.name + ' diverifikasi.');
        Router.render();
      };
    });
  }

  function viewSystemUsers() {
    TC.topbar('Kelola Pengguna', { sub: 'Akun pada perangkat ini', back: false });
    const users = Object.values(Store.state.users);
    const me = Store.user();

    setView(`
      <div class="note note--i">${icon('info')}
        <div><b>Cakupan purwarupa</b>Daftar ini memuat akun yang tersimpan di peramban ini.
        Pada sistem sungguhan, data pengguna berada di server dengan kontrol akses per peran.</div></div>

      <div class="section-title">${icon('users')} Akun lokal
        <span class="push"></span><span class="chip">${users.length}</span></div>
      <div class="list">
        ${users.map((u) => {
          const r = D.role(u.role || 'pasien');
          return `<div class="row">
            <span class="avatar" style="background:${r.color}">${esc(initials(u.name))}</span>
            <div style="min-width:0"><b>${esc(u.name)}${u.id === me.id ? ' · Anda' : ''}</b>
              <small>${esc(u.email)}</small>
              <small class="tiny" style="color:var(--faint)">
                ${u.provider === 'google' ? 'Masuk lewat Google' : u.demo ? 'Akun tamu' : 'Email & kata sandi'}</small></div>
            <button class="chip" style="margin-left:auto;background:${r.color}1a;color:${r.color};border-color:transparent"
                    data-urole="${u.id}">${esc(r.short)}</button>
          </div>`;
        }).join('')}
      </div>

      <div class="section-title">${icon('shield')} Sebaran peran</div>
      <div class="card">
        ${D.ROLES.map((r) => {
          const n = users.filter((u) => (u.role || 'pasien') === r.id).length;
          return `<div class="macro">
            <span class="macro__ico" style="background:${r.color}1a;color:${r.color}">${icon(r.icon)}</span>
            <b>${esc(r.name)}</b><span class="num">${n}</span></div>`;
        }).join('')}
      </div>
    `);

    $$('[data-urole]').forEach((b) => {
      b.onclick = () => roleSheet(b.dataset.urole);
    });
  }

  /** Mengubah peran sebuah akun (dipakai admin dan mode demo). */
  function roleSheet(userId) {
    const u = Store.state.users[userId];
    if (!u) return;
    sheet(`
      <h3>Ubah peran</h3>
      <p class="sub">${esc(u.name)} · ${esc(u.email)}</p>
      <div class="stack--sm stack">
        ${D.ROLES.filter((r) => !TC.peranTersembunyi(r.id)).map((r) => `
          <button class="row" data-setrole="${r.id}" style="border-radius:16px;
            ${(u.role || 'pasien') === r.id ? 'box-shadow:inset 0 0 0 1.5px var(--green-400);background:var(--green-50)' : ''}">
            <span class="row__ico" style="background:${r.color}1a;color:${r.color}">${icon(r.icon)}</span>
            <div style="min-width:0"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></div>
            ${(u.role || 'pasien') === r.id ? `<span class="chip chip--g" style="margin-left:auto">aktif</span>` : icon('chev', 'chev')}
          </button>`).join('')}
      </div>`);

    $$('[data-setrole]').forEach((b) => {
      b.onclick = () => {
        const role = b.dataset.setrole;
        Store.update((s) => {
          const x = s.users[userId];
          x.role = role;
          if (role === 'dokter' && !x.doctorId) x.doctorId = 'd1';
          if (role === 'admin-faskes' && !x.facilityId) x.facilityId = 'f1';
        });
        closeSheet();
        toast('Peran diubah menjadi ' + D.role(role).name + '.');
        const me = Store.user();
        if (me && me.id === userId) Router.navigate(D.role(role).home, true);
        else Router.render();
      };
    });
  }

  function viewSystemDoctors() {
    TC.topbar('Kelola Dokter', { sub: D.DOCTORS.length + ' mitra terdaftar', back: false });
    setView(`
      <div class="note note--w">${icon('alert')}
        <div><b>Katalog contoh</b>Nama, tarif, rating, dan jumlah ulasan berasal dari data
        purwarupa. Status verifikasi yang Anda ubah tersimpan di perangkat ini.</div></div>
      <div class="searchbar mt">${icon('search')}
        <input id="dq" type="search" placeholder="Cari nama atau spesialisasi" aria-label="Cari dokter"></div>
      <div class="list mt" id="dList"></div>`);

    function draw(q) {
      const list = D.DOCTORS.filter((d) => !q ||
        (d.name + ' ' + D.spec(d.spec).name + ' ' + d.hospital).toLowerCase().indexOf(q) !== -1);
      $('#dList').innerHTML = list.map((doc) => `
        <div class="row">
          <span class="avatar" style="background:${doc.color}">${esc(initials(doc.name))}</span>
          <div style="min-width:0"><b>${esc(doc.name)}</b>
            <small>${esc(D.spec(doc.spec).name)} · ${esc(doc.hospital)}</small>
            <small class="tiny" style="color:var(--faint)">${rupiah(doc.price)} · ${doc.reviews} ulasan</small></div>
          <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
            ${doc.verified === false && !Store.isVerified(doc.id)
              ? `<span class="chip chip--a">${icon('alert')} belum diverifikasi</span>`
              : `<span class="chip chip--g">${icon('verify')} terverifikasi</span>`}
            ${doc.online ? `<span class="chip chip--g"><i class="dotlive"></i> online</span>`
                         : `<span class="chip">luring</span>`}</span>
        </div>`).join('');
    }
    draw('');
    $('#dq').oninput = (e) => draw(e.target.value.trim().toLowerCase());
  }

  function viewSystemFacilities() {
    TC.topbar('Kelola Faskes', { sub: D.FACILITIES.length + ' unit terdaftar', back: false });
    setView(`
      <div class="note note--w">${icon('alert')}
        <div><b>Katalog contoh</b>Jumlah anggota, perangkat, nakes, dan sebaran triase pada
        kartu-kartu ini adalah data purwarupa.</div></div>
      <div class="stack mt">
        ${D.FACILITIES.map((f) => {
          const ok = Math.max(0, f.members - f.critical - f.warn);
          return `<div class="card">
            <div style="display:flex;gap:12px;align-items:center">
              <span class="row__ico" style="width:44px;height:44px;border-radius:14px">${icon(f.icon)}</span>
              <div style="min-width:0"><b style="font-size:.95rem">${esc(f.name)}</b>
                <small class="muted" style="display:block;font-size:.78rem">
                  ${esc(f.kind)} · ${esc(f.city)}</small></div>
              <span class="chip" style="margin-left:auto">${esc(f.plan)}</span>
            </div>
            <div class="stat-row mt" style="gap:7px">
              <div style="box-shadow:none;background:var(--canvas);border:0">
                <b style="font-size:1rem">${f.members}</b><span>Anggota</span></div>
              <div style="box-shadow:none;background:var(--canvas);border:0">
                <b style="font-size:1rem">${f.devices}</b><span>Perangkat</span></div>
              <div style="box-shadow:none;background:var(--canvas);border:0">
                <b style="font-size:1rem">${f.staff}</b><span>Nakes</span></div>
            </div>
            <div class="mt">${triaseBar(ok, f.warn, f.critical)}</div>
          </div>`;
        }).join('')}
      </div>`);
  }

  /* ============================================================
     4. KALIBRASI SENSOR — alat pengembang (khusus admin platform)
     ============================================================
     Setiap sensor punya galat sistematisnya sendiri. Layar ini memberi
     pengembang cara mengoreksinya per jenis perangkat tanpa menyentuh
     kode: nilai = mentah * gain + offset.

     Sengaja dipisahkan dari Profil → Kalibrasi Tekanan Darah. Yang itu
     milik pengguna: satu titik acuan dari tensimeter untuk dirinya
     sendiri. Yang ini milik pengembang: transformasi per model sensor,
     berlaku untuk semua parameter.
     ============================================================ */
  function viewSystemCalibration() {
    const jenisAktif = sessionStorage.getItem('tc.calType') || 'band';
    const master = Store.state.sensorCalOn !== false;
    const aktifDev = Store.activeDevice();

    TC.topbar('Kalibrasi Sensor', { sub: 'Alat pengembang', back: false });

    setView(`
      <div class="note note--b">${icon('info')}
        <div><b>Berlaku hanya untuk nilai dari perangkat sungguhan</b>
        Koreksi diterapkan pada bacaan yang masuk lewat Web Bluetooth
        (<span class="mono">Vitals.ingest</span>). Nilai simulasi purwarupa tidak dikalibrasi —
        mengoreksi angka yang dibangkitkan sendiri tidak ada artinya.</div></div>

      <div class="card mt">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="row__ico" style="background:${master ? 'var(--green-50)' : 'var(--canvas-2)'};
            color:${master ? 'var(--green-600)' : 'var(--faint)'}">${icon('sync')}</span>
          <div style="min-width:0">
            <b style="font-size:.95rem">${master ? 'Kalibrasi aktif' : 'Kalibrasi dimatikan'}</b>
            <small class="muted" style="display:block;font-size:.78rem">
              ${master ? 'Bacaan sensor dikoreksi sebelum dipakai'
                       : 'Bacaan sensor dipakai apa adanya'}</small>
          </div>
          <label style="margin-left:auto;display:flex;align-items:center">
            <input type="checkbox" id="calMaster" ${master ? 'checked' : ''}
                   style="width:22px;height:22px;accent-color:var(--green-500)"></label>
        </div>
        ${aktifDev ? `<p class="tiny muted mt">Perangkat aktif di perangkat ini:
          <b>${esc(aktifDev.name)}</b> (${esc(aktifDev.type)})${
            aktifDev.type !== jenisAktif ? ' — berbeda dari jenis yang sedang Anda sunting' : ''}</p>` : `
          <p class="tiny muted mt">Belum ada perangkat terpasang; pratinjau memakai nilai contoh.</p>`}
      </div>

      <div class="section-title">${icon('watch')} Jenis perangkat</div>
      <div class="seg" id="calSeg" style="flex-wrap:wrap">
        ${D.DEVICE_TYPES.map((t) => `
          <button data-caltype="${esc(t.type)}" class="${t.type === jenisAktif ? 'is-active' : ''}">
            ${esc(t.name)}${Store.calAktif(t.type) ? ' ●' : ''}</button>`).join('')}
      </div>

      <div id="calBody" class="mt"></div>

      <div class="section-title">${icon('doc')} Berkas kalibrasi</div>
      <div class="card">
        <p class="small" style="color:var(--ink-2)">Seluruh profil dapat dipindahkan antar perangkat
        pengembang lewat berkas JSON.</p>
        <div class="duo mt">
          <button class="btn btn--ghost" data-cal-export>${icon('doc')} Ekspor JSON</button>
          <button class="btn btn--ghost" data-cal-import>${icon('plus')} Impor JSON</button>
        </div>
        <button class="btn btn--dangerSoft btn--block mt" data-cal-reset-all>
          ${icon('trash')} Kosongkan semua profil</button>
      </div>
    `);

    /* ---------------- isi per jenis ---------------- */
    function nilaiPratinjau(param) {
      // Pratinjau memakai bacaan mentah sungguhan bila ada; kalau tidak,
      // memakai nilai tengah rentang parameter supaya efek gain terlihat.
      const mentahNyata = TC.Vitals.raw ? TC.Vitals.raw()[param] : null;
      if (typeof mentahNyata === 'number' && isFinite(mentahNyata)) {
        return { mentah: mentahNyata, nyata: true };
      }
      const p = TC.Calib.param(param);
      const contoh = { hr: 72, hrv: 45, spo2: 97, temp: 36.6, sys: 118, dia: 76, glucose: 95 };
      return { mentah: contoh[param] != null ? contoh[param] : Math.round((p.min + p.max) / 2), nyata: false };
    }

    function gambarBody() {
      const jenis = sessionStorage.getItem('tc.calType') || 'band';
      const t = D.deviceType(jenis);
      const params = TC.Calib.paramsFor(jenis);
      const body = $('#calBody');
      if (!body) return;

      if (!params.length) {
        body.innerHTML = `<div class="empty">${icon('info')}
          <b>${esc(t.name)} tidak memasok parameter vital</b>
          <p>Kemampuannya (${esc((t.caps || []).join(', '))}) belum masuk ke mesin vital,
             jadi tidak ada yang perlu dikalibrasi di sini.</p></div>`;
        return;
      }

      body.innerHTML = `
        <div class="stack--sm stack">
          ${params.map((p) => {
            const c = Store.cal(jenis, p.id);
            const pv = nilaiPratinjau(p.id);
            const hasil = TC.Calib.apply(p.id, pv.mentah, jenis);
            return `
            <div class="card" data-cal-row="${esc(p.id)}">
              <div style="display:flex;align-items:center;gap:10px">
                <b style="font-size:.95rem">${esc(p.label)}</b>
                <span class="chip" style="font-size:.66rem">${esc(p.unit)}</span>
                <span class="push"></span>
                <label style="display:flex;align-items:center;gap:7px" class="tiny muted">aktif
                  <input type="checkbox" data-cal-on="${esc(p.id)}" ${c.on ? 'checked' : ''}
                         style="width:18px;height:18px;accent-color:var(--green-500)"></label>
              </div>

              <div class="duo mt">
                <label class="field" style="margin:0"><span>Gain (pengali)</span>
                  <input type="number" step="0.0001" data-cal-gain="${esc(p.id)}" value="${c.gain}"></label>
                <label class="field" style="margin:0"><span>Offset (${esc(p.unit)})</span>
                  <input type="number" step="0.01" data-cal-offset="${esc(p.id)}" value="${c.offset}"></label>
              </div>

              <div class="mono small mt" style="background:var(--canvas);border:1px solid var(--line);
                   border-radius:12px;padding:10px 12px;color:var(--ink-2)">
                ${pv.nyata ? '' : 'contoh '}mentah <b>${pv.mentah}</b>
                &nbsp;→&nbsp; terkoreksi <b style="color:var(--green-600)"
                data-cal-out="${esc(p.id)}">${hasil == null ? '—' : Math.round(hasil * 100) / 100}</b>
                <span class="tiny muted"> · rentang sah ${p.min}–${p.max}</span>
              </div>

              <details class="mt">
                <summary class="small" style="cursor:pointer;color:var(--green-600);font-weight:700">
                  Hitung dari dua titik pengukuran</summary>
                <p class="tiny muted mt">Ukur dua kali dengan alat acuan, lalu masukkan pasangannya.
                   Gain dan offset dihitung dari garis yang melewati keduanya.</p>
                <div class="duo mt">
                  <label class="field" style="margin:0"><span>Mentah 1</span>
                    <input type="number" step="0.01" data-tp="m1" data-tpp="${esc(p.id)}"></label>
                  <label class="field" style="margin:0"><span>Acuan 1</span>
                    <input type="number" step="0.01" data-tp="a1" data-tpp="${esc(p.id)}"></label>
                </div>
                <div class="duo">
                  <label class="field" style="margin:0"><span>Mentah 2</span>
                    <input type="number" step="0.01" data-tp="m2" data-tpp="${esc(p.id)}"></label>
                  <label class="field" style="margin:0"><span>Acuan 2</span>
                    <input type="number" step="0.01" data-tp="a2" data-tpp="${esc(p.id)}"></label>
                </div>
                <button class="btn btn--soft btn--sm btn--block mt" data-cal-fit="${esc(p.id)}">
                  ${icon('sparkle')} Hitung gain &amp; offset</button>
              </details>
            </div>`;
          }).join('')}
        </div>

        <div class="duo mt2">
          <button class="btn btn--primary" data-cal-save>${icon('check')} Simpan</button>
          <button class="btn btn--ghost" data-cal-reset>${icon('refresh')} Netralkan jenis ini</button>
        </div>`;

      pasangBody(jenis);
    }

    function bacaAngka(sel) {
      const el = $(sel);
      if (!el) return null;
      const v = parseFloat(el.value);
      return isFinite(v) ? v : null;
    }

    function pasangBody(jenis) {
      // Pratinjau diperbarui saat gain/offset diubah, tanpa perlu menyimpan.
      const segarkanPratinjau = (id) => {
        const g = bacaAngka(`[data-cal-gain="${id}"]`);
        const o = bacaAngka(`[data-cal-offset="${id}"]`);
        const on = $(`[data-cal-on="${id}"]`).checked;
        const pv = nilaiPratinjau(id);
        const p = TC.Calib.param(id);
        const out = $(`[data-cal-out="${id}"]`);
        if (!out) return;
        if (!on || g == null || o == null) { out.textContent = on ? '—' : pv.mentah; return; }
        const v = clamp(pv.mentah * g + o, p.min, p.max);
        out.textContent = Math.round(v * 100) / 100;
      };

      $$('[data-cal-gain], [data-cal-offset]').forEach((el) => {
        el.oninput = () => segarkanPratinjau(el.dataset.calGain || el.dataset.calOffset);
      });
      $$('[data-cal-on]').forEach((el) => {
        el.onchange = () => segarkanPratinjau(el.dataset.calOn);
      });

      $$('[data-cal-fit]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.calFit;
          const g = (n) => {
            const el = $(`[data-tp="${n}"][data-tpp="${id}"]`);
            const v = el ? parseFloat(el.value) : NaN;
            return isFinite(v) ? v : null;
          };
          const hasil = TC.Calib.dariDuaTitik(g('m1'), g('a1'), g('m2'), g('a2'));
          if (!hasil) {
            toast('Lengkapi keempat angka, dan pastikan dua nilai mentahnya berbeda.', 'err');
            return;
          }
          $(`[data-cal-gain="${id}"]`).value = hasil.gain;
          $(`[data-cal-offset="${id}"]`).value = hasil.offset;
          segarkanPratinjau(id);
          toast(`gain ${hasil.gain} · offset ${hasil.offset}`);
        };
      });

      $('[data-cal-save]').onclick = () => {
        let n = 0;
        TC.Calib.paramsFor(jenis).forEach((p) => {
          const g = bacaAngka(`[data-cal-gain="${p.id}"]`);
          const o = bacaAngka(`[data-cal-offset="${p.id}"]`);
          const on = $(`[data-cal-on="${p.id}"]`).checked;
          if (g == null || o == null) return;
          if (g === 0) return;                   // gain nol menghapus sinyal
          Store.setCal(jenis, p.id, { gain: g, offset: o, on });
          n++;
        });
        toast(n ? `${n} parameter disimpan untuk ${D.deviceType(jenis).name}.`
                : 'Tidak ada nilai sah untuk disimpan.', n ? '' : 'err');
        Router.render();
      };

      $('[data-cal-reset]').onclick = async () => {
        const ok = await confirmSheet({
          title: 'Netralkan kalibrasi?',
          body: `Seluruh gain dan offset untuk ${D.deviceType(jenis).name} kembali ke 1 dan 0.`,
          ok: 'Netralkan', danger: true
        });
        if (!ok) return;
        Store.resetCal(jenis);
        toast('Kalibrasi dinetralkan.');
        Router.render();
      };
    }

    gambarBody();

    /* ---------------- pemilih jenis ---------------- */
    const seg = $('#calSeg');
    $$('[data-caltype]', seg).forEach((b) => {
      b.onclick = () => {
        sessionStorage.setItem('tc.calType', b.dataset.caltype);
        $$('[data-caltype]', seg).forEach((x) => x.classList.remove('is-active'));
        b.classList.add('is-active');
        gambarBody();
      };
    });

    $('#calMaster').onchange = (e) => {
      Store.update((s) => { s.sensorCalOn = e.target.checked; });
      toast(e.target.checked ? 'Kalibrasi sensor aktif.' : 'Kalibrasi sensor dimatikan.');
      Router.render();
    };

    /* ---------------- berkas ---------------- */
    $('[data-cal-export]').onclick = () => {
      const isi = JSON.stringify({
        jenis: 'telecare-kalibrasi-sensor', versi: 1,
        dibuat: new Date().toISOString(),
        aktif: Store.state.sensorCalOn !== false,
        profil: Store.state.sensorCal || {}
      }, null, 2);
      const blob = new Blob([isi], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'telecare-kalibrasi.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Berkas kalibrasi diunduh.');
    };

    $('[data-cal-import]').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const j = JSON.parse(String(fr.result));
            const profil = j && j.profil;
            if (!profil || typeof profil !== 'object') throw new Error('struktur tidak dikenali');
            // Hanya jenis perangkat dan parameter yang dikenal yang diterima,
            // supaya berkas asing tidak menyuntikkan kunci sembarangan.
            let n = 0;
            Object.keys(profil).forEach((jenis) => {
              if (!D.DEVICE_TYPES_SEMUA.some((t) => t.type === jenis)) return;
              Object.keys(profil[jenis] || {}).forEach((param) => {
                if (!TC.Calib.param(param)) return;
                const c = profil[jenis][param] || {};
                const g = typeof c.gain === 'number' ? c.gain : 1;
                const o = typeof c.offset === 'number' ? c.offset : 0;
                if (!isFinite(g) || !isFinite(o) || g === 0) return;
                Store.setCal(jenis, param, { gain: g, offset: o, on: c.on !== false });
                n++;
              });
            });
            if (typeof j.aktif === 'boolean') {
              Store.update((s) => { s.sensorCalOn = j.aktif; });
            }
            toast(n ? `${n} parameter diimpor.` : 'Tidak ada parameter yang dikenali.', n ? '' : 'err');
            Router.render();
          } catch (e) {
            toast('Berkas tidak dapat dibaca: ' + e.message, 'err');
          }
        };
        fr.readAsText(f);
      };
      inp.click();
    };

    $('[data-cal-reset-all]').onclick = async () => {
      const ok = await confirmSheet({
        title: 'Kosongkan semua profil kalibrasi?',
        body: 'Seluruh jenis perangkat kembali netral. Tindakan ini tidak dapat dibatalkan.',
        ok: 'Kosongkan', danger: true
      });
      if (!ok) return;
      Store.resetCal();
      toast('Semua profil dikosongkan.');
      Router.render();
    };

    // Pratinjau mengikuti bacaan yang masuk, supaya efek koreksi terlihat langsung.
    const un = TC.Vitals.subscribe(() => {
      TC.Calib.paramsFor(sessionStorage.getItem('tc.calType') || 'band').forEach((p) => {
        const out = $(`[data-cal-out="${p.id}"]`);
        if (!out) return;
        const pv = nilaiPratinjau(p.id);
        if (!pv.nyata) return;
        const g = bacaAngka(`[data-cal-gain="${p.id}"]`);
        const o = bacaAngka(`[data-cal-offset="${p.id}"]`);
        const on = $(`[data-cal-on="${p.id}"]`);
        if (g == null || o == null || !on) return;
        const meta = TC.Calib.param(p.id);
        out.textContent = on.checked
          ? Math.round(clamp(pv.mentah * g + o, meta.min, meta.max) * 100) / 100
          : pv.mentah;
      });
    });
    Router.onLeave(un);
  }

  TC.views = TC.views || {};
  Object.assign(TC.views, {
    clinic: viewClinic, queue: viewQueue, patients: viewPatients, patientDetail: viewPatientDetail,
    systemCalibration: viewSystemCalibration,
    facility: viewFacility, facilityMembers: viewFacilityMembers,
    facilityDevices: viewFacilityDevices, facilityStaff: viewFacilityStaff,
    system: viewSystem, systemUsers: viewSystemUsers,
    systemDoctors: viewSystemDoctors, systemFacilities: viewSystemFacilities,
    roleSheet
  });
})(window.TC);
