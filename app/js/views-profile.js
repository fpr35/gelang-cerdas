/* ============================================================
   TeleCare App — views-profile.js
   Profil pengguna, informasi pribadi, tujuan kesehatan,
   hub perangkat AIoT, pemindaian, dan kalibrasi tekanan darah.
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, $$, esc, icon, clamp, Store, Router, setView, setTopbar, toast,
          relTime, initials, sheet, closeSheet, confirmSheet } = TC;
  const D = TC.DATA;

  /* ---------------- 1. PROFIL ---------------- */
  function viewProfile() {
    const u = Store.user();
    const p = Store.profile();
    const PASIEN = Store.is('pasien');
    // Perangkat lama berjenis tersembunyi (mis. TeleRing) tidak ditampilkan.
    const devs = Store.state.devices.filter((d) => D.jenisTampil(d.type));
    const conn = devs.filter((d) => d.connected).length;

    TC.topbar('Profil Pengguna', { back: false });
    setView(`
      <div class="prof-head">
        <span class="avatar avatar--lg" style="background:${D.role(u.role || 'pasien').color}">
          ${esc(initials(u.name))}</span>
        <div style="min-width:0">
          <b>${esc(p.nickname || u.name)}</b>
          <small>${esc(u.email)}</small>
          <small>${esc(u.phone || (u.provider === 'google' ? 'Masuk lewat Google' : ''))}</small>
        </div>
        <span class="chip" style="margin-left:auto;background:${D.role(u.role || 'pasien').color}1a;
          color:${D.role(u.role || 'pasien').color};border-color:transparent">
          ${icon(D.role(u.role || 'pasien').icon)} ${esc(D.role(u.role || 'pasien').short)}</span>
      </div>

      <div class="stat-row mt" ${PASIEN ? '' : 'hidden'}>
        <div><b>${Store.state.meals.length}</b><span>Sesi tercatat</span></div>
        <div><b>${devs.length}</b><span>Perangkat</span></div>
        ${TC.FITUR.konsultasi
          ? `<div><b>${Store.state.consults.length}</b><span>Konsultasi</span></div>`
          : `<div><b>${TC.Readings.list().length}</b><span>Hasil ukur</span></div>`}
      </div>

      <div class="section-title">${icon('user')} ${(u.role && u.role !== 'pasien') ? 'Akun' : 'Akun &amp; kesehatan'}</div>
      <div class="list">
        <a class="row" href="#/profil/pribadi"><span class="row__ico">${icon('user')}</span>
          <div><b>${PASIEN ? 'Informasi Pribadi' : 'Informasi Akun'}</b><small>${PASIEN
            ? 'Nama, usia, tinggi, berat badan, dan aktivitas' : 'Nama dan kontak'}</small></div>
          ${icon('chev', 'chev')}</a>
        ${PASIEN ? `<a class="row" href="#/profil/tujuan"><span class="row__ico">${icon('target')}</span>
          <div><b>Tujuan Kesehatan</b><small>${esc(D.goal(p.goal).name)} · ${p.targets.kcal} kkal/hari</small></div>
          ${icon('chev', 'chev')}</a>
        <a class="row" href="#/perangkat"><span class="row__ico">${icon('watch')}</span>
          <div><b>Status Perangkat</b><small>${conn} dari ${devs.length} perangkat tersambung</small></div>
          ${icon('chev', 'chev')}</a>
        ${Store.is('pasien') || (TC.FITUR.peranDokter && Store.is('dokter')) ? `<a class="row" href="#/profil/unit"><span class="row__ico">${icon('building')}</span>
          <div><b>Unit saya</b><small>${Store.is('dokter') ? 'Bergabung sebagai nakes' : 'Bergabung sebagai anggota'} unit faskes lewat kode unit</small></div>
          ${icon('chev', 'chev')}</a>` : ''}
        ${PASIEN && TC.FITUR.peranDokter ? `<a class="row" href="#/profil/dokter"><span class="row__ico">${icon('stetho')}</span>
          <div><b>Dokter saya</b><small>Bagikan hasil ukur TeleBand ke dokter lewat kode dokter</small></div>
          ${icon('chev', 'chev')}</a>` : ''}
        <a class="row" href="#/profil/kalibrasi"><span class="row__ico">${icon('bp')}</span>
          <div><b>Kalibrasi Tekanan Darah</b>
            <small>${p.bpCal ? 'Terakhir ' + esc(relTime(p.bpCal.at)) : 'Belum pernah dikalibrasi'}</small></div>
          ${icon('chev', 'chev')}</a>` : ''}
      </div>

      <div class="section-title">${icon('cal')} Layanan</div>
      <div class="list">
        ${TC.FITUR.konsultasi ? `<a class="row" href="#/jadwal"><span class="row__ico">${icon('cal')}</span>
          <div><b>Janji Temu</b><small>${Store.state.appointments.length} jadwal tersimpan</small></div>
          ${icon('chev', 'chev')}</a>` : ''}
        ${PASIEN ? `<a class="row" href="#/riwayat"><span class="row__ico">${icon('doc')}</span>
          <div><b>Riwayat Lengkap</b><small>Sesi makan${TC.FITUR.konsultasi ? ', konsultasi,' : ''} dan ${TC.FITUR.simulasi ? 'sinkronisasi' : 'hasil ukur'}</small></div>
          ${icon('chev', 'chev')}</a>` : ''}
        <a class="row" href="#/notifikasi"><span class="row__ico">${icon('bell')}</span>
          <div><b>Notifikasi</b><small>${Store.unread()} belum dibaca</small></div>
          ${icon('chev', 'chev')}</a>
      </div>

      <div class="section-title">${icon('shield')} Aplikasi</div>
      <div class="list">
        <a class="row" href="#/profil/pengaturan"><span class="row__ico">${icon('sync')}</span>
          <div><b>Pengaturan</b><small>${TC.FITUR.simulasi ? 'Mode demo, notifikasi,' : 'Notifikasi'} dan data lokal</small></div>
          ${icon('chev', 'chev')}</a>
        <a class="row" href="#/tentang"><span class="row__ico">${icon('info')}</span>
          <div><b>Tentang TeleCare</b><small>Batasan penggunaan dan sumber data</small></div>
          ${icon('chev', 'chev')}</a>
        <button class="row" data-switch ${TC.FITUR.gantiPeran ? '' : 'hidden'}><span class="row__ico">${icon('swap')}</span>
          <div><b>Ganti peran</b><small>${TC.FITUR.simulasi ? 'Mode purwarupa · lihat aplikasi dari sudut pandang lain' : 'Pasien atau dokter'}</small></div>
          ${icon('chev', 'chev')}</button>
        <button class="row row--danger" data-logout><span class="row__ico">${icon('out')}</span>
          <div><b>Keluar</b><small>${PASIEN ? 'Riwayat tetap tersimpan di perangkat ini' : 'Mengakhiri sesi admin di perangkat ini'}</small></div></button>
      </div>

      <div class="note note--w mt2" ${PASIEN ? '' : 'hidden'}>${icon('alert')}
        <div><b>Data kesehatan adalah data pribadi</b>Hindari membagikan tangkapan layar Beranda
        atau Analisis di ruang publik — layar itu memuat nama, tanggal, dan kebiasaan harian Anda.</div></div>
    `);

    $('[data-logout]').onclick = async () => {
      const ok = await confirmSheet({
        title: 'Keluar dari akun?',
        body: 'Keluar hanya memutus sesi di perangkat ini. Seluruh riwayat tetap tersimpan dan muncul kembali saat Anda masuk lagi.',
        ok: 'Keluar', danger: true
      });
      if (!ok) return;
      if (TC.FB) TC.FB.signOut();
      Store.update((s) => { s.session = null; });
      Router.navigate(PASIEN ? '/masuk' : '/masuk/admin', true);
      toast('Anda telah keluar.');
    };

    $('[data-switch]').onclick = () => TC.views.roleSheet(u.id);
  }

  /* ---------------- 1b. DOKTER SAYA (pasien) ----------------
     Pasien menautkan diri ke dokter dengan KODE DOKTER. Selama tautan ada,
     dokter itu dapat membaca hasil ukur TeleBand pasien dari server
     (supabase/migrations/20260926_care_links.sql). */
  function viewMyDoctors() {
    TC.topbar('Dokter saya', { sub: 'Bagikan hasil ukur TeleBand ke dokter' });
    setView(`
      <div class="card">
        <div class="card__head">${icon('link')}<h3>Hubungkan dengan dokter</h3></div>
        <p class="small muted">Minta <b>kode dokter</b> (6 karakter) dari dokter Anda. Setelah terhubung,
          dokter dapat melihat hasil ukur TeleBand Anda — tidak lebih.</p>
        <form id="fKode" class="mt" novalidate style="display:flex;gap:9px;flex-wrap:wrap">
          <input id="kodeIn" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false"
            placeholder="Mis. K7P2QX" aria-label="Kode dokter"
            style="flex:1;min-width:140px;font:inherit;font-size:1.1rem;letter-spacing:.16em;text-transform:uppercase;
                   padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)">
          <button class="btn btn--primary" type="submit">Hubungkan</button>
        </form>
      </div>

      <div class="section-title">${icon('stetho')} Dokter terhubung</div>
      <div id="dokList"><p class="small muted tc" style="padding:14px">Memuat…</p></div>

      <div class="note note--i mt2">${icon('info')}
        <div><b>Anda yang memegang kendali</b>Memutus tautan langsung menghentikan akses dokter
        itu ke hasil ukur Anda.</div></div>
    `);

    const galat = (e) => (TC.CareDB && TC.CareDB.belumDimigrasi(e)
      ? 'Fitur ini belum aktif di server (migrasi 20260926_care_links.sql belum dijalankan).'
      : (e && e.message) || 'Gagal menghubungi server.');

    async function muat() {
      const box = $('#dokList');
      try {
        const list = await TC.CareDB.dokterSaya();
        if (!$('#dokList')) return;
        box.innerHTML = list.length ? `<div class="list">${list.map((l) => `
          <div class="row">
            <span class="avatar" style="background:#0E7FB8">${esc(TC.initials(l.doctor_name))}</span>
            <div style="min-width:0"><b>${esc(l.doctor_name)}</b>
              <small>Terhubung ${esc(relTime(new Date(l.created_at).getTime()))}</small></div>
            <button class="btn btn--dangerSoft btn--sm" style="margin-left:auto" data-putus="${esc(l.doctor_id)}"
              data-nama="${esc(l.doctor_name)}">Putuskan</button>
          </div>`).join('')}</div>`
          : `<div class="card"><p class="small muted tc" style="padding:14px">Belum ada dokter yang terhubung.</p></div>`;
        $$('[data-putus]').forEach((b) => {
          b.onclick = async () => {
            const ok = await confirmSheet({ title: 'Putuskan ' + b.dataset.nama + '?',
              body: 'Dokter ini tidak lagi dapat melihat hasil ukur Anda.', ok: 'Putuskan', danger: true });
            if (!ok) return;
            try { await TC.CareDB.putus(TC.FB.uid, b.dataset.putus); toast('Tautan diputus.'); }
            catch (e) { toast(galat(e), 'err'); }
            muat();
          };
        });
      } catch (e) {
        if (box) box.innerHTML = `<div class="note note--w">${icon('alert')}<div>${esc(galat(e))}</div></div>`;
      }
    }
    muat();

    $('#fKode').onsubmit = async (e) => {
      e.preventDefault();
      const kode = $('#kodeIn').value.trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(kode)) { toast('Kode dokter terdiri dari 6 huruf/angka.', 'err'); return; }
      const u = Store.user() || {};
      const nama = Store.profile().nickname || u.name || 'Pasien';
      try {
        const dokter = await TC.CareDB.hubungkan(kode, nama);
        toast('Terhubung dengan ' + dokter + '.');
        $('#kodeIn').value = '';
        muat();
      } catch (err) {
        toast(err && err.code === 'P0002' ? 'Kode dokter tidak ditemukan.' : galat(err), 'err');
      }
    };
  }

  /* ---------------- 1c. UNIT SAYA (pasien & dokter) ----------------
     Bergabung ke unit faskes dengan KODE UNIT. Pasien menjadi anggota —
     admin unit dapat membaca hasil ukur TeleBand-nya; dokter menjadi nakes
     (supabase/migrations/20260926_facilities.sql). */
  function viewMyUnits() {
    const dokter = Store.is('dokter');
    TC.topbar('Unit saya', { sub: dokter ? 'Bergabung sebagai tenaga kesehatan' : 'Bergabung sebagai anggota unit' });
    setView(`
      <div class="card">
        <div class="card__head">${icon('building')}<h3>Gabung ke unit</h3></div>
        <p class="small muted">Minta <b>kode unit</b> (6 karakter) dari admin faskes.
          ${dokter ? 'Anda akan tercatat sebagai nakes unit itu.'
            : 'Setelah bergabung, admin unit dapat melihat hasil ukur TeleBand Anda — tidak lebih.'}</p>
        <form id="fUnit" class="mt" novalidate style="display:flex;gap:9px;flex-wrap:wrap">
          <input id="unitIn" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false"
            placeholder="Mis. P4TR8M" aria-label="Kode unit"
            style="flex:1;min-width:140px;font:inherit;font-size:1.1rem;letter-spacing:.16em;text-transform:uppercase;
                   padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface)">
          <button class="btn btn--primary" type="submit">Gabung</button>
        </form>
      </div>

      <div class="section-title">${icon('building')} Unit Anda</div>
      <div id="unitList"><p class="small muted tc" style="padding:14px">Memuat…</p></div>

      <div class="note note--i mt2">${icon('info')}
        <div><b>Anda yang memegang kendali</b>Keluar dari unit langsung menghentikan akses admin
        unit itu ke hasil ukur Anda.</div></div>
    `);

    const galat = (e) => (TC.CareDB && TC.CareDB.belumDimigrasi(e)
      ? 'Fitur ini belum aktif di server (migrasi 20260926_facilities.sql belum dijalankan).'
      : (e && e.message) || 'Gagal menghubungi server.');

    async function muat() {
      const box = $('#unitList');
      try {
        const list = await TC.FacilityDB.unitSaya();
        if (!$('#unitList')) return;
        box.innerHTML = list.length ? `<div class="list">${list.map((m) => `
          <div class="row">
            <span class="row__ico">${icon('building')}</span>
            <div style="min-width:0"><b>${esc(m.facility_name)}</b>
              <small>${m.role === 'dokter' ? 'Nakes' : 'Anggota'} · sejak ${esc(relTime(new Date(m.created_at).getTime()))}</small></div>
            <button class="btn btn--dangerSoft btn--sm" style="margin-left:auto" data-keluar="${esc(m.facility_id)}"
              data-nama="${esc(m.facility_name)}">Keluar</button>
          </div>`).join('')}</div>`
          : `<div class="card"><p class="small muted tc" style="padding:14px">Belum tergabung di unit mana pun.</p></div>`;
        $$('[data-keluar]').forEach((b) => {
          b.onclick = async () => {
            const ok = await confirmSheet({ title: 'Keluar dari ' + b.dataset.nama + '?',
              body: dokter ? 'Anda tidak lagi tercatat sebagai nakes unit ini.'
                : 'Admin unit tidak lagi dapat melihat hasil ukur Anda.', ok: 'Keluar', danger: true });
            if (!ok) return;
            try { await TC.FacilityDB.keluar(b.dataset.keluar); toast('Anda keluar dari unit.'); }
            catch (e) { toast(galat(e), 'err'); }
            muat();
          };
        });
      } catch (e) {
        if (box) box.innerHTML = `<div class="note note--w">${icon('alert')}<div>${esc(galat(e))}</div></div>`;
      }
    }
    muat();

    $('#fUnit').onsubmit = async (e) => {
      e.preventDefault();
      const kode = $('#unitIn').value.trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(kode)) { toast('Kode unit terdiri dari 6 huruf/angka.', 'err'); return; }
      const u = Store.user() || {};
      const nama = Store.profile().nickname || u.name || (dokter ? 'Dokter' : 'Anggota');
      try {
        const unit = await TC.FacilityDB.gabung(kode, nama, dokter ? 'dokter' : 'pasien');
        toast('Bergabung dengan ' + unit + '.');
        $('#unitIn').value = '';
        muat();
      } catch (err) {
        toast(err && err.code === 'P0002' ? 'Kode unit tidak ditemukan.' : galat(err), 'err');
      }
    };
  }

  /* ---------------- 2. INFORMASI PRIBADI ---------------- */
  function viewPersonal() {
    const u = Store.user();
    const p = Store.profile();
    const PASIEN = Store.is('pasien');
    TC.topbar(PASIEN ? 'Informasi Pribadi' : 'Informasi Akun', { sub: PASIEN ? 'Dipakai untuk menghitung target' : 'Nama dan kontak admin' });

    setView(`
      <form id="fInfo">
        <label class="field"><span>Nama lengkap</span>
          <span class="wrap"><input name="name" value="${esc(u.name)}"></span></label>
        <label class="field"><span>Nama panggilan</span>
          <span class="wrap"><input name="nickname" value="${esc(p.nickname || '')}"></span>
          <span class="hint">Muncul pada sapaan di halaman Beranda.</span></label>
        <div ${PASIEN ? '' : 'hidden'}>
        <label class="field"><span>Jenis kelamin</span>
          <span class="wrap"><select name="gender">
            <option value="">Belum diisi</option>
            <option value="perempuan"${p.gender === 'perempuan' ? ' selected' : ''}>Perempuan</option>
            <option value="laki-laki"${p.gender === 'laki-laki' ? ' selected' : ''}>Laki-laki</option>
          </select></span>
          <span class="hint">Memengaruhi perhitungan kebutuhan energi harian.</span></label>
        <div class="grid2">
          <label class="field"><span>Usia (tahun)</span>
            <span class="wrap"><input name="age" type="number" min="5" max="110" value="${p.age || ''}"></span></label>
          <label class="field"><span>Tinggi badan (cm)</span>
            <span class="wrap"><input name="height" type="number" min="80" max="230" value="${p.height || ''}"></span></label>
        </div>
        <label class="field"><span>Berat badan (kg)</span>
          <span class="wrap"><input name="weight" type="number" min="20" max="250" step="0.1" value="${p.weight || ''}"></span>
          <span class="hint">Perbarui sebulan sekali agar target harian tetap masuk akal.</span></label>
        <label class="field"><span>Tingkat aktivitas</span>
          <span class="wrap"><select name="aktivitas">
            <option value="">Belum diisi</option>
            ${TC.Gizi.AKTIVITAS.map((a) => `<option value="${a.id}"${p.aktivitas === a.id ? ' selected' : ''}>${esc(a.nama)} — ${esc(a.desc)}</option>`).join('')}
          </select></span>
          <span class="hint">Menentukan faktor pengali kebutuhan energi harian.</span></label>
        </div>

        <div class="section-title">${icon('mail')} Kontak pemulihan</div>
        <label class="field"><span>Email</span>
          <span class="wrap"><input name="email" type="email" value="${esc(u.email)}"></span></label>
        <label class="field"><span>Nomor HP</span>
          <span class="wrap"><input name="phone" type="tel" value="${esc(u.phone)}"></span>
          <span class="hint">Pastikan keduanya aktif — pemulihan akun hanya lewat jalur terdaftar.</span></label>

        ${PASIEN ? bmiCard(p) : ''}
        <button class="btn btn--primary btn--lg btn--block mt2" type="submit">Simpan perubahan</button>
      </form>`);

    $('#fInfo').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.name.value.trim().length < 3) { toast('Nama terlalu pendek.', 'err'); return; }
      Store.update((s) => {
        const user = s.users[s.session.userId];
        user.name = f.name.value.trim();
        user.email = f.email.value.trim();
        user.phone = f.phone.value.trim();
        Object.assign(s.profile, {
          nickname: f.nickname.value.trim(),
          gender: f.gender.value,
          age: +f.age.value || null,
          height: +f.height.value || null,
          weight: +f.weight.value || null,
          aktivitas: f.aktivitas.value || null
        });
        TC.Gizi.terapkan(s.profile);
      });
      const pr = Store.profile();
      toast(!PASIEN ? 'Perubahan tersimpan.'
        : pr.targetManual ? 'Perubahan tersimpan. Target gizi tetap memakai angka yang Anda ketik sendiri.'
        : TC.Gizi.kurang(pr).length ? 'Perubahan tersimpan. Lengkapi ' + TC.Gizi.kurang(pr).join(', ') + ' agar target dihitung dari profil.'
        : 'Perubahan tersimpan. Target gizi dihitung ulang: ' + pr.targets.kcal + ' kkal/hari.');
      Router.render();
    };
  }

  function bmiCard(p) {
    if (!p.height || !p.weight) {
      return `<div class="note note--i mt">${icon('info')}
        <div><b>Lengkapi tinggi dan berat</b>Selama profil belum lengkap, target gizi memakai paket
        bawaan yang sama untuk semua orang, bukan kebutuhan Anda.</div></div>`;
    }
    const h = p.height / 100;
    const bmi = p.weight / (h * h);
    const cat = bmi < 18.5 ? ['Berat kurang', 'a'] : bmi < 25 ? ['Berat ideal', 'g']
      : bmi < 30 ? ['Berat berlebih', 'a'] : ['Obesitas', 'r'];
    return `<div class="card mt">
      <div class="card__head">${icon('target')}<h3>Indeks Massa Tubuh</h3>
        <span class="push"></span><span class="chip chip--${cat[1]}">${cat[0]}</span></div>
      <div style="display:flex;align-items:baseline;gap:8px">
        <b style="font-size:1.9rem;letter-spacing:-.04em">${bmi.toFixed(1)}</b>
        <span class="tiny muted">kg/m²</span></div>
      <p class="tiny muted mt">IMT hanya gambaran kasar dan tidak membedakan massa otot dari lemak.</p>
    </div>`;
  }

  /* ---------------- 3. TUJUAN KESEHATAN ---------------- */
  function viewGoals() {
    const p = Store.profile();
    TC.topbar('Tujuan Kesehatan', { sub: 'Menentukan target pada Beranda' });

    setView(`
      <div class="section-title" style="margin-top:0">${icon('target')} Capaian hari ini
        <span class="push"></span><span class="chip">${esc(D.goal(p.goal).name)}</span></div>
      ${TC.views.kartuTarget()}

      <div class="section-title">${icon('info')} Dasar perhitungan target</div>
      ${kartuDasar(p)}

      <div class="section-title">${icon('sparkle')} Pilih tujuan</div>
      <div class="stack--sm stack" id="goalList">
        ${D.GOALS.map((g) => ({ g, tg: TC.Gizi.targetUntuk(p, g.id) })).map(({ g, tg }) => `
          <button class="card" data-goal="${g.id}" style="text-align:left;width:100%;
            border-color:${g.id === p.goal ? 'var(--green-400)' : 'var(--line)'};
            background:${g.id === p.goal ? 'var(--green-50)' : 'var(--surface)'}">
            <div style="display:flex;align-items:center;gap:10px">
              <b style="font-size:.95rem">${esc(g.name)}</b>
              ${g.id === p.goal ? `<span class="chip chip--g" style="margin-left:auto">${icon('check')} Dipilih</span>` : ''}
            </div>
            <p class="small muted mt" style="margin-top:6px">${esc(g.desc)}</p>
            <div class="metric3 mt" style="grid-template-columns:repeat(4,1fr)">
              <div><span>Kalori</span><b style="font-size:1rem">${tg.kcal}</b></div>
              <div><span>Karbo</span><b style="font-size:1rem">${tg.carb}</b></div>
              <div><span>Protein</span><b style="font-size:1rem">${tg.protein}</b></div>
              <div><span>Lemak</span><b style="font-size:1rem">${tg.fat}</b></div>
            </div>
          </button>`).join('')}
      </div>

      <div class="section-title">${icon('edit')} Sesuaikan target sendiri</div>
      <form id="fTarget" class="card">
        <div class="grid2">
          <label class="field"><span>Kalori (kkal)</span>
            <span class="wrap"><input name="kcal" type="number" min="800" max="5000" value="${p.targets.kcal}"></span></label>
          <label class="field"><span>Karbohidrat (g)</span>
            <span class="wrap"><input name="carb" type="number" min="20" max="700" value="${p.targets.carb}"></span></label>
          <label class="field"><span>Protein (g)</span>
            <span class="wrap"><input name="protein" type="number" min="20" max="300" value="${p.targets.protein}"></span></label>
          <label class="field"><span>Lemak (g)</span>
            <span class="wrap"><input name="fat" type="number" min="10" max="250" value="${p.targets.fat}"></span></label>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Simpan target</button>
      </form>

      <div class="note note--d mt2">${icon('alert')}
        <div><b>Hindari target yang ekstrem</b>Menurunkan kalori jauh di bawah kebutuhan tubuh
        tidak mempercepat hasil dan dapat membahayakan. Bila Anda memiliki kondisi kesehatan tertentu,
        sedang hamil atau menyusui, tetapkan target bersama tenaga kesehatan.</div></div>
    `);

    $$('[data-goal]').forEach((b) => {
      b.onclick = () => {
        const g = D.goal(b.dataset.goal);
        Store.update((s) => {
          s.profile.goal = g.id;
          TC.Gizi.terapkan(s.profile, true);
        });
        toast('Tujuan diperbarui: ' + g.name + ' · ' + Store.profile().targets.kcal + ' kkal/hari');
        Router.render();
      };
    });

    $('#fTarget').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      Store.update((s) => {
        s.profile.targets = {
          kcal: clamp(+f.kcal.value || 2000, 800, 5000),
          carb: clamp(+f.carb.value || 250, 20, 700),
          protein: clamp(+f.protein.value || 60, 20, 300),
          fat: clamp(+f.fat.value || 65, 10, 250)
        };
        s.profile.targetManual = true;
      });
      toast('Target sendiri tersimpan. Perubahan profil tidak akan menimpanya.');
      Router.render();
    };

    const ulang = $('[data-hitung-ulang]');
    if (ulang) ulang.onclick = () => {
      Store.update((s) => { TC.Gizi.terapkan(s.profile, true); });
      toast('Target dihitung ulang dari profil.');
      Router.render();
    };
  }

  /** Penjelasan dari mana angka target berasal — ditampilkan apa adanya. */
  function kartuDasar(p) {
    const h = TC.Gizi.hitung(p, p.goal);
    const kurang = TC.Gizi.kurang(p);
    if (p.targetManual) {
      return `<div class="note note--i">${icon('edit')}
        <div><b>Memakai target yang Anda ketik sendiri</b>Perubahan profil tidak menimpanya.
        ${kurang.length ? '' : `Hitungan dari profil Anda: ${h.targets.kcal} kkal.`}
        <button class="btn btn--soft btn--sm mt" data-hitung-ulang ${kurang.length ? 'hidden' : ''}>
          ${icon('refresh')} Hitung ulang dari profil</button></div></div>`;
    }
    if (!h) {
      return `<div class="note note--w">${icon('alert')}
        <div><b>Target masih paket bawaan</b>Angka saat ini sama untuk semua orang. Lengkapi
        ${esc(kurang.join(', '))} di <a class="link" href="#/profil/pribadi">Informasi Pribadi</a>
        agar target dihitung dari kebutuhan Anda.</div></div>`;
    }
    const adj = h.penyesuaian;
    return `<div class="card">
      <div class="stack--sm stack">
        <div><div style="display:grid;gap:2px;font-size:.9rem">
          <b>1. Energi basal (BMR) ${h.bmr} kkal</b>
          <small>Mifflin-St Jeor: 10×${p.weight} kg + 6,25×${p.height} cm − 5×${p.age} th
            ${p.gender === 'laki-laki' ? '+ 5' : '− 161'}</small></div></div>
        <div><div style="display:grid;gap:2px;font-size:.9rem">
          <b>2. Kebutuhan harian ${h.tdee} kkal</b>
          <small>BMR × ${h.aktivitas.f} (${esc(h.aktivitas.nama.toLowerCase())})</small></div></div>
        <div><div style="display:grid;gap:2px;font-size:.9rem">
          <b>3. Target energi ${h.targets.kcal} kkal</b>
          <small>${adj ? (adj > 0 ? '+' : '−') + Math.abs(adj) + ' kkal untuk tujuan ini' : 'Tanpa penyesuaian'}${
            h.dilantai ? ' · dinaikkan ke batas aman minimum' : ''}</small></div></div>
        <div><div style="display:grid;gap:2px;font-size:.9rem">
          <b>4. Pembagian zat gizi</b>
          <small>Protein ${h.tujuan.proteinPerKg} g/kg × ${p.weight} kg = ${h.targets.protein} g (${h.persen.protein}%) ·
            lemak ${Math.round(h.tujuan.lemakPct * 100)}% energi = ${h.targets.fat} g ·
            karbohidrat sisanya = ${h.targets.carb} g (${h.persen.carb}%)</small></div></div>
      </div>
      <p class="tiny muted mt">Perkiraan untuk orang dewasa sehat. Kebutuhan saat hamil, menyusui,
        atau dengan penyakit tertentu perlu ditetapkan bersama tenaga kesehatan.</p>
    </div>`;
  }

  /* ---------------- 4. HUB PERANGKAT ---------------- */
  function viewDevices() {
    // Perangkat lama berjenis tersembunyi (mis. TeleRing) tidak ditampilkan.
    const devs = Store.state.devices.filter((d) => D.jenisTampil(d.type));
    const active = Store.activeDevice();
    const pending = Store.state.pendingSamples;

    TC.topbar('Status Perangkat', { sub: 'Hub AIoT TeleCare', back: false,
      actions: `<button class="icon-btn" data-scan aria-label="Pindai">${icon('plus')}</button>` });

    setView(`
      ${active ? `
        <div class="card">
          <div class="dev-head">
            <span class="dev-card__ico" style="${active.connected
              ? 'background:var(--green-100);color:var(--green-600)' : ''}">
              ${icon(active.connected ? D.deviceType(active.type).icon : 'bt')}</span>
            <div class="dev-head__txt">
              <b style="font-size:.98rem">${active.connected ? 'Perangkat Tersambung' : 'Perangkat Terputus'}</b>
              <small class="muted" style="font-size:.8rem">${esc(active.name)} · ${esc(active.code)}</small>
              <small class="tiny muted">${active.lastSync ? 'Sinkron terakhir ' + esc(relTime(active.lastSync)) : 'Belum pernah sinkron'}</small>
            </div>
          </div>
          ${active.connected ? `<button class="btn btn--primary btn--block mt" data-sync>
            ${icon('sync')} Sinkronkan sekarang</button>` : ''}

          <div class="duo mt">
            <div class="card card--flat" style="background:var(--canvas);border:0">
              <span class="tiny muted" style="font-weight:700">Baterai</span>
              <b style="display:block;font-size:1.4rem;letter-spacing:-.03em">${active.battery != null ? active.battery + '%' : '—'}</b>
              <div class="bar" style="margin-top:6px"><i style="width:${active.battery || 0}%;
                background:${active.battery < 20 ? 'var(--coral-500)' : 'var(--green-500)'}"></i></div>
            </div>
            ${active.type === 'teleband' ? `
            <div class="card card--flat" style="background:var(--canvas);border:0">
              <span class="tiny muted" style="font-weight:700">Hasil di alat</span>
              <b style="display:block;font-size:1.4rem;letter-spacing:-.03em">${
                TC.TeleBandLink.status() ? TC.TeleBandLink.status().tersimpan : '—'}</b>
              <span class="tiny muted">${TC.Readings.belumTerkirim()} belum sampai server</span>
            </div>` : `
            <div class="card card--flat" style="background:var(--canvas);border:0">
              <span class="tiny muted" style="font-weight:700">Sampel tertunda</span>
              <b style="display:block;font-size:1.4rem;letter-spacing:-.03em">${pending}</b>
              <span class="tiny muted">${pending ? 'menunggu dipindahkan' : 'buffer jam kosong'}</span>
            </div>`}
          </div>

          ${active.connected ? `
            <div class="duo mt">
              <a class="btn btn--ghost btn--sm btn--block" href="#/perangkat/pindai">Ganti Perangkat</a>
              <button class="btn btn--ghost btn--sm btn--block" data-disc>Putuskan</button>
            </div>` : `
            <button class="btn btn--primary btn--block mt" data-recon>${icon('bt')} Sambungkan Ulang</button>`}
        </div>` : ''}

      <a class="row mt" href="#/teleband" style="border:1px solid var(--green-100);border-radius:16px;background:var(--green-50)">
        <span class="row__ico" style="background:var(--green-100);color:var(--green-600)">${icon('watch')}</span>
        <div style="min-width:0"><b>TeleBand (alat fisik)</b>
          <small>${TC.TeleBandLink.tersambung() ? 'Tersambung · ketuk untuk mengukur'
            : 'Sambungkan lewat Bluetooth dan ukur detak jantung & SpO₂'}</small></div>
        ${icon('chev', 'chev')}</a>

      <div class="steps3 mt">
        <div class="s"><i>${icon('bt')}</i>1. Aktifkan Bluetooth</div>
        <div class="ar">${icon('arrow')}</div>
        <div class="s"><i>${icon('watch')}</i>2. Nyalakan Perangkat</div>
        <div class="ar">${icon('arrow')}</div>
        <div class="s"><i>${icon('link')}</i>3. Hubungkan di Aplikasi</div>
      </div>

      <div class="section-title">${icon('watch')} Perangkat terpasang
        <span class="push"></span><span class="chip">${devs.length}</span></div>
      ${devs.length ? `<div class="stack--sm stack">
        ${devs.map((d) => {
          const t = D.deviceType(d.type);
          return `<button class="dev-card${d.connected ? ' is-on' : ''}" data-dev="${d.id}">
            <span class="dev-card__ico">${icon(t.icon)}</span>
            <span style="min-width:0;flex:1">
              <b>${esc(d.name)}</b><small>${esc(d.code)}</small>
              <span class="meta">
                <span class="chip ${d.connected ? 'chip--g' : ''}" style="font-size:.66rem">
                  ${d.connected ? 'tersambung' : 'terputus'}</span>
                <span class="chip" style="font-size:.66rem">${icon('battery')} ${d.battery != null ? d.battery + '%' : '—'}</span>
              </span>
            </span>
            <span class="signal" data-l="${d.connected ? (d.rssi || 3) : 0}"><i></i><i></i><i></i><i></i></span>
          </button>`;
        }).join('')}
      </div>` : `
        <div class="empty">${icon('bt')}<b>Belum ada perangkat</b>
        <p>Pindai untuk menemukan TeleBand di sekitar Anda.</p>
        <a class="btn btn--primary btn--sm mt" href="#/perangkat/pindai">Pindai &amp; Sambungkan</a></div>`}

      <div class="section-title">${icon('sparkle')} Perangkat yang didukung</div>
      <div class="stack--sm stack">
        ${D.DEVICE_TYPES.filter((t) => t.nyata).map((t) => `
          <div class="row" style="border:1px solid var(--line);border-radius:16px;background:var(--surface);align-items:flex-start">
            <span class="row__ico">${icon(t.icon)}</span>
            <div style="min-width:0"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">
                ${t.caps.map((c) => `<span class="chip" style="font-size:.64rem">${esc(D.CAP_LABEL[c] || c)}</span>`).join('')}
              </div>
            </div>
          </div>`).join('')}
      </div>

      <div class="note note--i mt2">${icon('info')}
        <div><b>Satu perangkat, satu ponsel</b>Perangkat TeleCare hanya dapat terhubung ke satu ponsel
        dalam satu waktu. Bila masih tersambung ke ponsel lain, ia tidak akan muncul saat dipindai.</div></div>
    `);

    $('[data-scan]').onclick = () => Router.navigate('/perangkat/pindai');

    const syncBtn = $('[data-sync]');
    if (syncBtn) {
      syncBtn.onclick = async () => {
        syncBtn.classList.add('is-disabled');
        syncBtn.innerHTML = icon('sync') + ' Menyinkronkan…';
        try {
          const n = await TC.Devices.sync();
          toast(n ? n + ' sampel dipindahkan ke aplikasi.' : 'Buffer jam sudah kosong.');
        } catch (e) { toast(e.message, 'err'); }
        Router.render();
      };
    }

    const discBtn = $('[data-disc]');
    if (discBtn) {
      discBtn.onclick = async () => {
        const ok = await confirmSheet({
          title: 'Putuskan sambungan?',
          body: 'Perangkat tetap mengukur dan menyimpan hasilnya di buffer. Anda dapat menyambungkan ulang kapan saja.',
          ok: 'Putuskan', danger: true
        });
        if (!ok) return;
        TC.Devices.disconnect(active.id);
        toast('Sambungan diputus.');
        Router.render();
      };
    }

    const reconBtn = $('[data-recon]');
    if (reconBtn && active.type === 'teleband') {
      // TeleBand disambungkan sungguhan dari layarnya sendiri, bukan disimulasikan.
      reconBtn.onclick = () => Router.navigate('/teleband');
    } else if (reconBtn) {
      reconBtn.onclick = () => {
        reconBtn.classList.add('is-disabled');
        reconBtn.innerHTML = icon('sync') + ' Menyambungkan…';
        setTimeout(() => { TC.Devices.reconnect(active.id); Router.render(); }, 1100);
      };
    }

    $$('[data-dev]').forEach((b) => {
      b.onclick = () => Router.navigate('/perangkat/' + b.dataset.dev);
    });
  }

  /* ---------------- 5. PINDAI PERANGKAT ---------------- */
  /*
   * Satu jalur saja: TeleBand sungguhan lewat Web Bluetooth.
   *
   * Dulu halaman ini memuat tiga hal sekaligus — daftar perangkat simulasi,
   * pemindaian BLE generik (ble.js), dan tautan ke TeleBand — dan pengguna
   * memilih jalur yang salah: TeleBand tampak "tersambung" lewat jalur
   * generik padahal tidak pernah mengirim angka. Pemindaian simulasi
   * (Devices.simulateScan) dan jalur generik (Devices.realScan) tetap ada di
   * engine.js, hanya tidak lagi ditawarkan di sini.
   */
  function viewScan() {
    TC.topbar('Pindai Perangkat', { sub: 'Sambungkan TeleBand lewat Bluetooth' });
    const L = TC.TeleBandLink;

    if (L.tersambung()) { Router.navigate('/teleband', true); return; }

    const didukung = TC.TeleBand.supported();
    setView(`
      <div class="scan-pulse"><i></i><i></i><i></i><b>${icon('bt')}</b></div>
      <p class="tc small muted">Nyalakan TeleBand dan dekatkan ke perangkat ini.</p>

      ${didukung ? `
        <button class="btn btn--primary btn--lg btn--block mt2" data-pindai>${icon('bt')} Pindai &amp; sambungkan TeleBand</button>
        <p class="tiny muted tc mt">Pilih <b>TeleCare-…</b> di daftar yang muncul. Saat pertama kali,
          sistem akan meminta <b>pairing</b> — setujui saja.</p>` : `
        <div class="note note--w mt2">${icon('alert')}
          <div><b>Bluetooth tidak tersedia di peramban ini</b>Buka TeleCare di <b>Chrome atau Edge</b>
          (Android atau komputer). Safari di iPhone/iPad tidak mendukung Web Bluetooth.</div></div>`}

      <div class="steps3 mt2">
        <div class="s"><i>${icon('bt')}</i>1. Aktifkan Bluetooth</div>
        <div class="ar">${icon('arrow')}</div>
        <div class="s"><i>${icon('watch')}</i>2. Nyalakan TeleBand</div>
        <div class="ar">${icon('arrow')}</div>
        <div class="s"><i>${icon('link')}</i>3. Pindai &amp; pilih</div>
      </div>

      <p class="tiny muted tc mt">Jangan menyambungkan TeleBand dari pengaturan Bluetooth ponsel —
        cukup dari tombol di atas. TeleBand yang sedang tersambung ke ponsel lain tidak akan muncul.</p>
    `);

    const b = $('[data-pindai]');
    if (b) b.onclick = () => {
      b.disabled = true;
      b.innerHTML = icon('sync') + ' Menyambungkan…';
      L.sambung().then(() => {
        toast('TeleBand tersambung.');
        Router.navigate('/teleband', true);
      }).catch((e) => {
        if (e && e.name === 'NotFoundError') toast('Tidak ada TeleBand dipilih.', 'err');
        else toast('Gagal menyambung: ' + ((e && e.message) || e) + ' — coba sekali lagi.', 'err');
        b.disabled = false;
        b.innerHTML = icon('bt') + ' Pindai &amp; sambungkan TeleBand';
      });
    };
  }

  /* ---------------- 6. DETAIL PERANGKAT ---------------- */
  function viewDeviceDetail(params) {
    const d = Store.state.devices.find((x) => x.id === params.id);
    if (!d) { Router.navigate('/perangkat', true); return; }
    if (d.type === 'teleband') { Router.navigate('/teleband', true); return; }
    const t = D.deviceType(d.type);

    TC.topbar(d.name, { sub: d.code });
    setView(`
      <div class="card tc" style="padding:24px">
        <span class="dev-card__ico" style="width:66px;height:66px;border-radius:22px;margin:0 auto 12px;
          ${d.connected ? 'background:var(--green-100);color:var(--green-600)' : ''}">
          ${icon(t.icon)}</span>
        <h2 style="font-size:1.1rem">${esc(d.name)}</h2>
        <p class="tiny muted mono mt">${esc(d.code)}</p>
        <div class="mt"><span class="chip chip--${d.connected ? 'g' : ''}">
          ${d.connected ? '<i class="dotlive"></i> tersambung' : 'terputus'}</span></div>
      </div>

      <div class="stat-row mt">
        <div><b>${d.battery}%</b><span>Baterai</span></div>
        <div><b>${t.rateHz || '—'}</b><span>Hz sampling</span></div>
        <div><b>${d.rssi || 0}/4</b><span>Sinyal</span></div>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('heart')}<h3>Parameter yang diukur</h3></div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          ${t.caps.map((c) => `<span class="chip chip--g">${esc(D.CAP_LABEL[c] || c)}</span>`).join('')}
        </div>
        <p class="small muted mt">${esc(t.desc)}</p>
      </div>

      <div class="list mt">
        <div class="row"><span class="row__ico">${icon('link')}</span>
          <div><b>Dipasangkan</b><small>${esc(relTime(d.pairedAt))}</small></div></div>
        <div class="row"><span class="row__ico">${icon('sync')}</span>
          <div><b>Sinkron terakhir</b><small>${d.lastSync ? esc(relTime(d.lastSync)) : 'Belum pernah'}</small></div></div>
      </div>

      <div class="stack--sm stack mt2">
        ${d.connected
          ? `<button class="btn btn--ghost btn--block" data-disc>${icon('bt')} Putuskan sambungan</button>`
          : `<button class="btn btn--primary btn--block" data-recon>${icon('bt')} Sambungkan ulang</button>`}
        <button class="btn btn--dangerSoft btn--block" data-forget>${icon('trash')} Lupakan perangkat</button>
      </div>
    `);

    const dc = $('[data-disc]');
    if (dc) dc.onclick = () => { TC.Devices.disconnect(d.id); toast('Sambungan diputus.'); Router.render(); };
    const rc = $('[data-recon]');
    if (rc) rc.onclick = () => { TC.Devices.reconnect(d.id); Router.render(); };

    $('[data-forget]').onclick = async () => {
      const ok = await confirmSheet({
        title: 'Lupakan perangkat ini?',
        body: 'Perangkat dihapus dari daftar. Anda perlu memindai ulang untuk memakainya kembali.',
        ok: 'Lupakan', danger: true
      });
      if (!ok) return;
      TC.Devices.forget(d.id);
      toast('Perangkat dilupakan.');
      Router.navigate('/perangkat', true);
    };
  }

  /* ---------------- 7. KALIBRASI TEKANAN DARAH ---------------- */
  function viewCalibration() {
    const p = Store.profile();
    TC.topbar('Kalibrasi Tekanan Darah', { sub: 'Menyelaraskan sensor dengan tensimeter' });

    setView(`
      ${p.bpCal ? `
        <div class="card">
          <div class="card__head">${icon('check')}<h3>Kalibrasi tersimpan</h3>
            <span class="push"></span><span class="chip chip--g">${esc(relTime(p.bpCal.at))}</span></div>
          <div class="metric3">
            <div><span>Sistolik</span><b>${p.bpCal.sys}</b><small>mmHg</small></div>
            <div><span>Diastolik</span><b>${p.bpCal.dia}</b><small>mmHg</small></div>
            <div><span>Selisih jam</span><b>${p.bpCal.diff != null ? (p.bpCal.diff > 0 ? '+' : '') + p.bpCal.diff : '—'}</b><small>mmHg</small></div>
          </div>
        </div>` : `
        <div class="note note--w">${icon('alert')}
          <div><b>Belum pernah dikalibrasi</b>Selama belum dikalibrasi, estimasi tekanan darah dari
          perangkat hanya berguna untuk melihat kecenderungan kasar.</div></div>`}

      <div class="section-title">${icon('doc')} Langkah kalibrasi</div>
      <div class="list">
        ${[
          ['Siapkan tensimeter lengan', 'Gunakan alat yang sudah teruji — hasilnya menjadi acuan.'],
          ['Duduk tenang lima menit', 'Punggung bersandar, kaki menapak lantai, lengan setinggi jantung.'],
          ['Ukur dan catat hasilnya', 'Catat angka sistolik dan diastolik dari tensimeter.'],
          ['Pastikan perangkat terpasang', 'Jam melekat cukup rapat, sekitar satu jari di atas tulang pergelangan.'],
          ['Masukkan hasilnya di bawah', 'Aplikasi akan menyesuaikan pembacaan sensor terhadap angka ini.']
        ].map((s, i) => `<div class="row" style="align-items:flex-start">
          <span class="row__ico" style="font-weight:800">${i + 1}</span>
          <div><b>${esc(s[0])}</b><small>${esc(s[1])}</small></div></div>`).join('')}
      </div>

      <form id="fCal" class="card mt">
        <div class="grid2">
          <label class="field"><span>Sistolik (mmHg)</span>
            <span class="wrap"><input name="sys" type="number" min="70" max="250" placeholder="mis. 118" required></span></label>
          <label class="field"><span>Diastolik (mmHg)</span>
            <span class="wrap"><input name="dia" type="number" min="40" max="150" placeholder="mis. 76" required></span></label>
        </div>
        <button class="btn btn--primary btn--block" type="submit">${icon('check')} Simpan kalibrasi</button>
      </form>

      <div class="section-title">${icon('refresh')} Kapan perlu diulang</div>
      <div class="card">
        <ul style="display:grid;gap:9px">
          ${['Setiap kali hasil jam berselisih jauh dengan tensimeter.',
             'Setelah berat badan berubah cukup banyak.',
             'Bila Anda berpindah tangan saat memakai perangkat.',
             'Setelah perangkat diatur ulang ke pengaturan pabrik.',
             'Secara berkala, kira-kira sebulan sekali.'].map((s) =>
            `<li style="display:flex;gap:9px;font-size:.87rem;color:var(--ink-2)">
              <span style="color:var(--green-500);flex:none">${icon('check')}</span>${esc(s)}</li>`).join('')}
        </ul>
      </div>

      <div class="note note--d mt2">${icon('alert')}
        <div><b>Batas kemampuan pengukuran di pergelangan tangan</b>
        Sensor optik tidak menggantikan tensimeter, apalagi pemeriksaan tenaga kesehatan.
        Bila Anda merasakan nyeri dada, sesak napas, atau sakit kepala hebat, segera cari pertolongan
        medis tanpa menunggu pembacaan perangkat.</div></div>
    `);

    $('#fCal').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const sys = +f.sys.value, dia = +f.dia.value;
      if (!(sys > dia)) { toast('Sistolik harus lebih besar dari diastolik.', 'err'); return; }
      if (sys < 70 || sys > 250 || dia < 40 || dia > 150) { toast('Nilai di luar rentang wajar.', 'err'); return; }
      const diff = Math.round(TC.Vitals.state.sys - sys);
      Store.update((s) => { s.profile.bpCal = { sys, dia, diff, at: Date.now() }; });
      Store.notify('Kalibrasi tersimpan', `Acuan ${sys}/${dia} mmHg dari tensimeter.`, 'ok');
      toast('Kalibrasi tersimpan.');
      Router.render();
    };
  }

  /* ---------------- 8. PENGATURAN ---------------- */
  function viewSettings() {
    const s = Store.state.settings;
    const t = s.turn || {};
    TC.topbar('Pengaturan');
    setView(`
      <div class="section-title">${icon('clock')} ${TC.FITUR.simulasi ? 'Mode purwarupa' : 'Peringatan'}</div>
      <div class="list">
        <label class="row" ${TC.FITUR.simulasi ? '' : 'hidden'}>
          <span class="row__ico">${icon('clock')}</span>
          <div style="min-width:0"><b>Percepat waktu sesi</b>
            <small>Rentang 2 jam dipadatkan menjadi ± 2 menit agar alur dapat dicoba utuh.</small></div>
          <input type="checkbox" id="tFast" ${s.fastDemo ? 'checked' : ''}
                 style="margin-left:auto;width:20px;height:20px;accent-color:var(--green-500)">
        </label>
        <label class="row">
          <span class="row__ico">${icon('bell')}</span>
          <div style="min-width:0"><b>Peringatan eskalasi</b>
            <small>Vital yang menembus ambang dan peringatan perangkat.</small></div>
          <input type="checkbox" id="tNotif" ${s.notif ? 'checked' : ''}
                 style="margin-left:auto;width:20px;height:20px;accent-color:var(--green-500)">
        </label>
      </div>

      <div class="section-title">${icon('bell')} Notifikasi perangkat</div>
      <div class="card">
        <p class="small" style="color:var(--ink-2)">Peringatan eskalasi dihitung di perangkat ini
        dari nilai vital yang masuk, lalu ditampilkan sebagai notifikasi sistem — tetap muncul
        walau aplikasi berada di latar belakang. Push dari server memerlukan konfigurasi tambahan.</p>

        <div id="pushStatus" class="mt"></div>

        <div class="duo mt">
          <button class="btn btn--primary" data-push-ask>${icon('bell')} Izinkan notifikasi</button>
          <button class="btn btn--ghost" data-push-test>${icon('sparkle')} Kirim uji</button>
        </div>

        <div class="note note--w mt2">${icon('alert')}
          <div><b>Bukan alat kesehatan</b>Ambang peringatan adalah heuristik penyaring untuk
          purwarupa, bukan kriteria diagnostik. Jangan dijadikan dasar keputusan medis.</div></div>
      </div>

      <div ${TC.FITUR.konsultasi ? '' : 'hidden'}>
      <div class="section-title">${icon('video')} Panggilan (TURN)</div>
      <div class="card">
        <p class="small" style="color:var(--ink-2)">Panggilan memakai STUN publik. Di balik NAT
        ketat — jaringan kampus atau kantor berfirewall, dan CGNAT operator seluler — STUN saja
        tidak cukup dan panggilan bisa gagal tersambung. Server TURN merelai media untuk kasus itu.</p>

        <div id="turnStatus" class="mt"></div>

        <label class="field mt">
          <span>Alamat server TURN</span>
          <input id="turnUrls" type="text" inputmode="url" autocomplete="off" spellcheck="false"
                 placeholder="turn:turn.contoh.id:3478?transport=udp"
                 value="${esc(t.urls || '')}">
          <small>Boleh beberapa, dipisahkan tanda koma.</small>
        </label>
        <label class="field mt">
          <span>Nama pengguna</span>
          <input id="turnUser" type="text" autocomplete="off" spellcheck="false"
                 value="${esc(t.username || '')}">
        </label>
        <label class="field mt">
          <span>Kata sandi</span>
          <input id="turnPass" type="password" autocomplete="new-password"
                 value="${esc(t.credential || '')}">
          <small>Tersimpan di peramban ini saja, tidak dikirim ke server TeleCare.</small>
        </label>

        <div class="duo mt">
          <button class="btn btn--primary" data-turn-save>${icon('check')} Simpan</button>
          <button class="btn btn--ghost" data-turn-test>${icon('sync')} Uji konektivitas</button>
        </div>
        <button class="btn btn--ghost btn--block mt" data-turn-clear>${icon('trash')} Kosongkan TURN</button>
        <pre id="turnHasil" class="mono small mt" style="display:none;white-space:pre-wrap;
             background:var(--canvas);border:1px solid var(--line);border-radius:12px;padding:12px;
             color:var(--ink-2);margin:0"></pre>
      </div>
      </div>

      <div class="section-title">${icon('shield')} Data di perangkat ini</div>
      <div class="card">
        <p class="small" style="color:var(--ink-2)">Seluruh data aplikasi — akun, riwayat sesi,
        percakapan, dan daftar perangkat — disimpan di penyimpanan lokal peramban ini.
        Tidak ada data yang dikirim ke server.</p>
        <div class="stat-row mt">
          <div><b>${Store.state.meals.length}</b><span>Sesi</span></div>
          ${TC.FITUR.konsultasi
            ? `<div><b>${Store.state.consults.length}</b><span>Konsultasi</span></div>`
            : `<div><b>${TC.Readings.list().length}</b><span>Hasil ukur</span></div>`}
          <div><b>${Store.state.vitalsHistory.length}</b><span>Rekaman vital</span></div>
        </div>
        <button class="btn btn--ghost btn--block mt" data-export>${icon('doc')} Unduh data saya (JSON)</button>
        <button class="btn btn--dangerSoft btn--block mt" data-wipe>${icon('trash')} Hapus semua data lokal</button>
      </div>
    `);

    $('#tFast').onchange = (e) => {
      Store.update((st) => { st.settings.fastDemo = e.target.checked; });
      toast(e.target.checked ? 'Waktu sesi dipercepat.' : 'Sesi memakai waktu sesungguhnya.');
    };
    $('#tNotif').onchange = (e) => {
      Store.update((st) => { st.settings.notif = e.target.checked; });
      toast(e.target.checked ? 'Peringatan eskalasi aktif.' : 'Peringatan eskalasi dimatikan.');
    };

    /* ---------------- notifikasi perangkat ---------------- */
    function gambarStatusPush() {
      const el = $('#pushStatus');
      if (!el || !TC.Push) return;
      const st = TC.Push.status();
      const kelas = !st.didukung || st.izin === 'denied' ? 'chip--a'
                  : st.izin === 'granted' ? 'chip--g' : '';
      const ik = st.izin === 'granted' ? `<i class="dotlive"></i>` : icon(st.izin === 'denied' ? 'alert' : 'info');
      el.innerHTML = `<span class="chip ${kelas}">${ik} ${esc(st.ringkasan)}</span>`;

      const ask = $('[data-push-ask]');
      if (ask) {
        const sudah = st.izin === 'granted';
        ask.disabled = sudah || !st.didukung || st.izin === 'denied';
        ask.innerHTML = sudah ? `${icon('check')} Sudah diizinkan`
                              : `${icon('bell')} Izinkan notifikasi`;
      }
      const uji = $('[data-push-test]');
      if (uji) uji.disabled = st.izin !== 'granted';
    }
    gambarStatusPush();

    $('[data-push-ask]').onclick = async () => {
      try {
        const p = await TC.Push.request();
        gambarStatusPush();
        if (p === 'granted') {
          toast('Notifikasi diizinkan.');
          if (Store.is('pasien')) TC.Push.mulaiPantau();
        } else if (p === 'denied') {
          toast('Notifikasi diblokir. Ubah dari pengaturan peramban.', 'err');
        }
      } catch (e) {
        toast(e.message || 'Notifikasi tidak tersedia.', 'err');
      }
    };

    $('[data-push-test]').onclick = async () => {
      // Memakai jalur yang sama dengan peringatan sungguhan, supaya yang
      // diuji benar-benar mekanisme yang dipakai — bukan tiruannya.
      const ok = await TC.Push.show('Uji notifikasi TeleCare', {
        body: 'Bila ini terlihat, peringatan eskalasi akan sampai juga.',
        tag: 'telecare-uji'
      });
      toast(ok ? 'Notifikasi uji dikirim.' : 'Notifikasi tidak dapat ditampilkan.', ok ? '' : 'err');
    };

    /* ---------------- TURN ---------------- */
    function gambarStatusTurn() {
      const el = $('#turnStatus');
      if (!el || !TC.RTC) return;
      const ada = TC.RTC.turnTersedia();
      const dariPengguna = !!TC.RTC.turnDariPengaturan();
      const dariEndpoint = !!TC.RTC.config().fetchFrom;
      const sumber = dariPengguna ? 'dari pengaturan perangkat ini'
                   : dariEndpoint ? 'dari penerbit kredensial sementara'
                   : 'dari app/js/rtc-config.js';
      el.innerHTML = ada
        ? `<span class="chip chip--g"><i class="dotlive"></i> TURN dikonfigurasi ${esc(sumber)}</span>`
        : `<span class="chip chip--a">${icon('alert')} Belum ada TURN — hanya STUN</span>`;
    }
    gambarStatusTurn();

    $('[data-turn-save]').onclick = () => {
      const urls = $('#turnUrls').value.trim();
      const username = $('#turnUser').value.trim();
      const credential = $('#turnPass').value;
      if (urls && !/^(turn|turns):/i.test(urls)) {
        toast('Alamat TURN harus dimulai dengan turn: atau turns:');
        return;
      }
      Store.update((st) => {
        st.settings.turn = urls ? { urls, username, credential } : null;
      });
      gambarStatusTurn();
      toast(urls ? 'Pengaturan TURN disimpan.' : 'TURN dikosongkan.');
    };

    $('[data-turn-clear]').onclick = () => {
      Store.update((st) => { st.settings.turn = null; });
      $('#turnUrls').value = '';
      $('#turnUser').value = '';
      $('#turnPass').value = '';
      $('#turnHasil').style.display = 'none';
      gambarStatusTurn();
      toast('TURN dikosongkan.');
    };

    $('[data-turn-test]').onclick = async (e) => {
      const btn = e.currentTarget;
      const box = $('#turnHasil');
      btn.disabled = true;
      const semula = btn.innerHTML;
      btn.innerHTML = `${icon('sync')} Menguji…`;
      box.style.display = 'block';
      box.textContent = 'Mengumpulkan kandidat ICE…';
      try {
        const d = await TC.RTC.diagnose(9000);
        if (!d.didukung) { box.textContent = d.alasan; return; }
        box.textContent =
          `${d.ringkasan}\n\n` +
          `server ICE   : ${d.jumlahServer}\n` +
          `host         : ${d.jenis.host}   (jaringan lokal)\n` +
          `srflx        : ${d.jenis.srflx}   (alamat publik via STUN)\n` +
          `relay        : ${d.jenis.relay}   (via TURN)` +
          (d.protokolRelay.length ? `\nprotokol relay: ${d.protokolRelay.join(', ')}` : '');
      } catch (err) {
        box.textContent = 'Uji gagal: ' + (err && err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = semula;
      }
    };

    $('[data-export]').onclick = () => {
      // Kata sandi TURN sengaja tidak diikutkan: berkas ekspor sering dibagikan
      // atau diunggah, sedangkan kredensial itu memberi hak memakai bandwidth
      // server relai.
      const salinan = JSON.parse(JSON.stringify(Store.state));
      if (salinan.settings && salinan.settings.turn) {
        salinan.settings.turn = Object.assign({}, salinan.settings.turn, {
          credential: salinan.settings.turn.credential ? '(dihapus dari ekspor)' : ''
        });
      }
      const blob = new Blob([JSON.stringify(salinan, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'telecare-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Berkas data diunduh.');
    };

    $('[data-wipe]').onclick = async () => {
      const ok = await confirmSheet({
        title: 'Hapus semua data lokal?',
        body: 'Akun, riwayat sesi, percakapan, dan daftar perangkat pada peramban ini akan hilang permanen.',
        ok: 'Hapus semuanya', danger: true
      });
      if (!ok) return;
      Store.reset();
      location.hash = '/mulai';
      location.reload();
    };
  }

  /* ---------------- 9. TENTANG ---------------- */
  function viewAbout() {
    TC.topbar('Tentang TeleCare');
    setView(`
      <div class="card tc" style="padding:26px">
        <div style="width:66px;margin:0 auto 12px">${TC.views.logoSvg(66)}</div>
        <h2 style="font-size:1.2rem">TeleCare</h2>
        <p class="small muted mt">Platform Telemedisin AIoT Terpadu<br>berbasis Health 5.0</p>
        <span class="chip mt" style="margin-top:12px">Purwarupa · Iterasi 1</span>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('sparkle')}<h3>Apa yang dikerjakan aplikasi ini</h3></div>
        <p class="small" style="color:var(--ink-2);line-height:1.65">
          TeleCare menyatukan dua hal yang biasanya terpisah: pemantauan berkelanjutan dari perangkat
          wearable, dan akses ke tenaga kesehatan. Perangkat mengukur dan menyimpan; aplikasi menarik,
          menyusun, serta menjelaskan; dokter menerima konteksnya tanpa perlu Anda ketik ulang.</p>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('watch')}<h3>Perangkat yang didukung</h3></div>
        <div class="stack--sm stack">
          ${D.DEVICE_TYPES.filter((t) => t.nyata).map((t) => `<div style="display:flex;gap:10px;align-items:center">
            <span class="row__ico" style="width:32px;height:32px;border-radius:10px">${icon(t.icon)}</span>
            <div><b style="font-size:.87rem">${esc(t.name)}</b>
              <small class="tiny muted" style="display:block">${esc(t.tagline)}</small></div></div>`).join('')}
        </div>
      </div>

      <div class="note note--d mt">${icon('alert')}
        <div><b>Bukan alat diagnosis medis</b>
        TeleCare adalah alat bantu pemantauan gaya hidup. Angka yang ditampilkan tidak boleh dijadikan
        dasar untuk mendiagnosis penyakit, mengubah dosis obat, atau menunda pemeriksaan ke tenaga kesehatan.</div></div>

      <div class="card mt">
        <div class="card__head">${icon('link')}<h3>Teknologi yang dipakai</h3></div>
        <div class="stack--sm stack">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span class="row__ico" style="width:32px;height:32px;border-radius:10px">${icon('chat')}</span>
            <div><b style="font-size:.87rem">Supabase (Postgres + Realtime)</b>
              <small class="tiny muted" style="display:block">${TC.FITUR.konsultasi
                ? 'Percakapan konsultasi dan hasil ukur TeleBand tersimpan dan tersinkron antarperangkat.'
                : 'Hasil ukur TeleBand tersimpan di server, bukan hanya di peramban.'}</small></div>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start" ${TC.FITUR.konsultasi ? '' : 'hidden'}>
            <span class="row__ico" style="width:32px;height:32px;border-radius:10px">${icon('video')}</span>
            <div><b style="font-size:.87rem">WebRTC peer-to-peer</b>
              <small class="tiny muted" style="display:block">Panggilan suara dan video berjalan langsung antarperangkat, dengan pertukaran sinyal lewat Supabase Realtime dan relai TURN metered.ca bila jalur langsung terhalang.</small></div>
          </div>
          <div style="display:flex;gap:10px;align-items:flex-start">
            <span class="row__ico" style="width:32px;height:32px;border-radius:10px">${icon('bt')}</span>
            <div><b style="font-size:.87rem">Web Bluetooth</b>
              <small class="tiny muted" style="display:block">${TC.FITUR.simulasi
                ? 'Pemindaian perangkat BLE nyata bila peramban mendukungnya; selain itu memakai daftar simulasi.'
                : 'TeleBand tersambung langsung dari peramban (Chrome/Edge). Tanpa alat, tidak ada angka vital yang ditampilkan.'}</small></div>
          </div>
        </div>
      </div>

      <div class="note note--w mt">${icon('info')}
        <div><b>Status purwarupa</b>${TC.FITUR.simulasi
        ? `Nilai fisiologis pada iterasi ini dibangkitkan secara simulatif, dan balasan dokter dihasilkan
        otomatis dari pola kata kunci — tidak ada tenaga kesehatan sungguhan di balik layar, dan tidak
        ada transaksi yang ditagih. Percakapan serta panggilan, sebaliknya, berjalan sungguhan.`
        : `Semua angka vital berasal dari pengukuran TeleBand; tanpa alat, layar vital menampilkan “—”.
        Tekanan darah dan glukosa TeleBand adalah estimasi eksperimental. TeleCare bukan alat medis.`}</div></div>

      <div class="list mt2">
        <a class="row" href="../index.html"><span class="row__ico">${icon('link')}</span>
          <div><b>Situs penelitian TeleCare</b><small>Latar belakang, arsitektur, dan tim peneliti</small></div>
          ${icon('chev', 'chev')}</a>
      </div>

      <p class="tiny muted tc mt2">Program Studi Fisika · FMIPA<br>Edisi 2026</p>
    `);
  }

  TC.views = TC.views || {};
  Object.assign(TC.views, {
    myUnits: viewMyUnits,
    myDoctors: viewMyDoctors,
    profile: viewProfile, personal: viewPersonal, goals: viewGoals,
    devices: viewDevices, scan: viewScan, deviceDetail: viewDeviceDetail,
    calibration: viewCalibration, settings: viewSettings, about: viewAbout
  });
})(window.TC);
