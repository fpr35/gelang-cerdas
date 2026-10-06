/* ============================================================
   TeleCare App — views-auth.js
   Layar pembuka, masuk, daftar, dan pemulihan kata sandi.

   Autentikasi berjalan lokal di perangkat ini (mode purwarupa):
   akun disimpan di localStorage, bukan di server.
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, $$, esc, icon, uid, Store, Router, setView, setTopbar, toast,
          sheet, closeSheet } = TC;

  const logoSvg = (size) => `<svg viewBox="0 0 48 48" fill="none" style="width:${size}px;height:${size}px" aria-hidden="true">
    <rect x="2" y="2" width="44" height="44" rx="14" fill="url(#lg1)"/>
    <path d="M13 24.5h4.6l2.6-6.6 3.8 13 2.9-8.6 1.9 2.2H35" fill="none" stroke="#fff"
          stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    <defs><linearGradient id="lg1" x1="2" y1="2" x2="46" y2="46">
      <stop style="stop-color:var(--g1)"/><stop offset="1" style="stop-color:var(--g3)"/>
    </linearGradient></defs></svg>`;

  /* ---------------- ONBOARDING ---------------- */
  const SLIDES = [
    { art: () => TC.ilus3d('analisis'), title: 'Ukur langsung dari TeleBand',
      body: 'Sambungkan TeleBand lewat Bluetooth, ukur detak jantung dan SpO₂, lalu hasilnya tersimpan di satu riwayat kesehatan.' },
    { art: () => TC.ilus3d('konsultasi'), title: 'Dari data langsung ke dokter', fitur: 'konsultasi',
      body: 'Bila ada yang perlu ditanyakan, mulai konsultasi chat atau video call dengan konteks vital Anda sudah terlampir.' }
  ];

  function viewOnboard() {
    setTopbar('');
    let i = 0;
    // Slide untuk fitur yang sedang disembunyikan tidak ditampilkan.
    const SLIDES_AKTIF = SLIDES.filter((s) => !s.fitur || TC.FITUR[s.fitur]);

    function draw() {
      const s = SLIDES_AKTIF[i];
      const terakhir = i === SLIDES_AKTIF.length - 1;
      // Tombol kembali ke landing page (akar situs). Tautan relatif "../" dari
      // /app/ selalu menuju "/", baik lokal maupun di Firebase Hosting.
      setView(`<div class="onb">
        <div class="onb__top">
          <a class="topbar__back" href="../" aria-label="Kembali ke halaman utama TeleCare"
             title="Kembali ke halaman utama">${icon('back')}</a>
        </div>
        <div class="onb__art">${s.art()}</div>
        <h1>${esc(s.title)}</h1>
        <p>${esc(s.body)}</p>
        <div class="onb__dots">${SLIDES_AKTIF.map((_, k) =>
          `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="onb__act">
          <button class="btn btn--primary btn--lg btn--block" data-next>
            ${!terakhir ? 'Lanjut' : 'Mulai Sekarang'} ${icon('arrow')}</button>
          ${terakhir && !TC.FITUR.daftarAkun ? '' :
            '<button class="btn btn--ghost btn--block" data-login>Masuk ke Akun</button>'}
        </div>
      </div>`, { cls: 'view view--full' });

      $('[data-next]').onclick = () => {
        if (!terakhir) { i++; draw(); return; }
        Store.update((st) => { st.onboarded = true; });
        Router.navigate(TC.FITUR.daftarAkun ? '/daftar' : '/masuk');
      };
      const login = $('[data-login]');
      if (login) login.onclick = () => {
        Store.update((st) => { st.onboarded = true; });
        Router.navigate('/masuk');
      };
    }
    draw();
  }

  /* ---------------- MASUK ---------------- */
  function findUser(ident) {
    const users = Store.state.users;
    const k = String(ident || '').trim().toLowerCase();
    return Object.values(users).find(
      (u) => u.email.toLowerCase() === k || u.phone === k
    ) || null;
  }

  function signIn(user) {
    Store.masuk(user.id);
    TC.Devices.startBuffer();
    Router.navigate(TC.DATA.role(user.role || 'pasien').home, true);
    toast('Selamat datang kembali, ' + (user.nickname || user.name) + '!');
  }

  function viewLogin() {
    setTopbar('');
    setView(`<div class="auth">
      <div class="auth__top">
        <button class="topbar__back" data-back-onb aria-label="Kembali">${icon('back')}</button>
      </div>
      <div class="auth__body">
        <div class="auth__logo">${logoSvg(62)}</div>
        <h1>Selamat Datang Kembali!</h1>
        <p class="sub">Masuk untuk melanjutkan perjalanan sehatmu</p>

        <form id="fLogin" novalidate>
          <label class="field">
            <span>Email atau Nomor HP</span>
            <span class="wrap">${icon('user')}
              <input type="text" name="ident" autocomplete="username"
                     placeholder="Masukkan email atau nomor HP" required>
            </span>
          </label>
          <label class="field">
            <span>Kata Sandi</span>
            <span class="wrap">${icon('lock')}
              <input type="password" name="pass" autocomplete="current-password"
                     placeholder="Masukkan kata sandi" required>
              <button type="button" class="eye" data-eye aria-label="Tampilkan kata sandi">${icon('eye-off')}</button>
            </span>
          </label>
          <div style="text-align:right;margin:-6px 0 16px">
            <a class="link" href="#/lupa">Lupa kata sandi?</a>
          </div>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Masuk</button>
        </form>

        <div class="alt">atau masuk dengan</div>

        <button class="btn btn--ghost btn--lg btn--block" data-google>
          ${icon('google')} Masuk dengan Google</button>

        ${TC.FITUR.akunTamu ? `<div class="alt">atau tanpa akun</div>
        <button class="btn btn--soft btn--lg btn--block" data-guest>
          ${icon('user')} Masuk sebagai Tamu</button>
        <p class="tiny muted tc" style="margin-top:8px">
          Memakai akun demo berisi riwayat contoh. Anda dapat memilih perannya.</p>` : ''}

        ${TC.FITUR.daftarAkun
          ? '<div class="auth__foot">Belum punya akun? <b data-go-daftar>Daftar sekarang</b></div>' : ''}
      </div>
    </div>`, { cls: 'view view--full' });

    bindEye();
    $('[data-back-onb]').onclick = () => Router.navigate('/mulai');
    const daftar = $('[data-go-daftar]');
    if (daftar) daftar.onclick = () => Router.navigate('/daftar');
    // Tombol Apple dan nomor telepon dihapus, bukan disembunyikan: keduanya
    // hanya memunculkan pesan "belum tersedia" dan tidak pernah bisa bekerja
    // tanpa penyedia yang diaktifkan. Tombol yang tidak melakukan apa pun lebih
    // buruk daripada tidak ada tombol.
    $('[data-google]').onclick = () => googleSignIn($('[data-google]'));
    const tamu = $('[data-guest]');
    if (tamu) tamu.onclick = () => guestSheet();

    $('#fLogin').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const ident = f.ident.value.trim();
      const pass = f.pass.value;
      if (!ident || !pass) { toast('Lengkapi kedua kolom terlebih dahulu.', 'err'); return; }
      const u = findUser(ident);
      if (!u) { toast('Akun tidak ditemukan. Periksa email atau nomor Anda.', 'err'); return; }
      if (u.pass !== pass) { toast('Kata sandi salah. Coba periksa huruf besar/kecil.', 'err'); return; }
      signIn(u);
    };
  }

  function bindEye() {
    $$('[data-eye]').forEach((btn) => {
      btn.onclick = () => {
        const inp = btn.parentElement.querySelector('input');
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.innerHTML = icon(show ? 'eye' : 'eye-off');
      };
    });
  }

  /* ---------------- MASUK DENGAN GOOGLE ---------------- */
  function googleSignIn(btn) {
    if (!TC.FB || !TC.FB.googleAvailable()) {
      toast('Layanan masuk belum siap. Periksa koneksi internet lalu muat ulang halaman.', 'err');
      return;
    }
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.classList.add('is-disabled'); btn.innerHTML = icon('sync') + ' Menghubungkan…'; }

    TC.FB.signInGoogle().then((u) => {
      if (btn) { btn.classList.remove('is-disabled'); btn.innerHTML = label; }
      if (!u) return;               // alur pengalihan: halaman akan dimuat ulang
      adoptGoogleUser(u);
    }).catch((err) => {
      if (btn) { btn.classList.remove('is-disabled'); btn.innerHTML = label; }
      console.warn('[TeleCare] Google Sign-In:', err);
      // Pengguna menutup jendela Google sendiri: bukan galat.
      if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) {
        toast('Masuk dibatalkan.');
        return;
      }
      const kode = (err && err.code) || '';
      const pengaturan = kode === 'auth/operation-not-allowed' || kode === 'auth/configuration-not-found' ||
        kode === 'auth/unauthorized-domain';
      sheet(`
        <h3>Masuk dengan Google belum bisa</h3>
        <p class="sub">${esc(TC.FB.authError(err))}</p>
        ${pengaturan ? `<div class="note note--i">${icon('info')}
          <div><b>Untuk pengelola aplikasi</b>Buka Firebase Console → Authentication → Sign-in method →
          aktifkan <b>Google</b>, dan pastikan domain situs ada di Settings → Authorized domains.</div></div>` : ''}
        <button class="btn btn--primary btn--block mt" data-close>Mengerti</button>`);
    });
  }

  /**
   * Masuk pasien lewat Google. Akun admin DITOLAK di sini — admin hanya boleh
   * masuk lewat /masuk/admin — lalu sesinya langsung dikeluarkan.
   */
  function adoptGoogleUser(u) {
    TC.FB.cekAdmin().then((admin) => {
      if (!admin) { adoptGoogleUserLanjut(u); return; }
      TC.FB.signOut();
      Store.update((s) => { s.session = null; });
      Router.navigate('/masuk', true);
      toast('Akun ini terdaftar sebagai admin dan tidak bisa masuk sebagai pasien.', 'err');
    });
  }

  /** Membuat atau memakai kembali akun lokal untuk pengguna Google. */
  function adoptGoogleUserLanjut(u) {
    const meta = u.user_metadata || {};
    const email = u.email || (u.id + '@google.local');
    let existing = findUser(email);
    if (existing && existing.role === 'admin-faskes') existing = null;   // admin hanya lewat /masuk/admin
    if (existing) {
      Store.update((s) => {
        s.users[existing.id].googleUid = u.id;
        const photo = meta.avatar_url || meta.picture;
        if (photo) s.users[existing.id].photo = photo;
      });
      signIn(existing);
      return;
    }
    const id = uid('u');
    const name = meta.full_name || meta.name || (email.split('@')[0]);
    const user = {
      id, name, email, phone: u.phone || '',
      pass: null, provider: 'google', googleUid: u.id,
      photo: meta.avatar_url || meta.picture || null, role: 'pasien',
      nickname: name.split(/\s+/)[0], createdAt: Date.now()
    };
    // Sesi dulu, baru profil: masuk() menukar profil ke milik akun ini.
    // `diubah` sengaja tidak diisi — profil di server (dari perangkat lain)
    // harus menang atas profil kosong perangkat baru ini.
    Store.update((s) => { s.users[id] = user; s.onboarded = true; });
    Store.masuk(id);
    Store.update((s) => { s.profile.nickname = user.nickname; });
    TC.Devices.startBuffer();
    Router.navigate('/lengkapi', true);
    toast('Berhasil masuk sebagai ' + name + '.');
  }

  /* ---------------- MASUK ADMIN ----------------
     Halaman terpisah di /masuk/admin, sengaja tanpa tautan dari layar mana
     pun. Memakai akun Firebase Auth (email + kata sandi) yang punya dokumen
     di koleksi `admins`; bukan akun lokal. */
  function viewLoginAdmin() {
    setTopbar('');
    setView(`<div class="auth">
      <div class="auth__top">
        <a class="topbar__back" href="../" aria-label="Kembali ke halaman utama TeleCare"
           title="Kembali ke halaman utama">${icon('back')}</a>
      </div>
      <div class="auth__body">
        <div class="auth__logo">${logoSvg(62)}</div>
        <h1>Masuk Admin</h1>
        <p class="sub">Khusus pengelola unit TeleCare</p>

        <form id="fAdmin" novalidate>
          <label class="field">
            <span>Email</span>
            <span class="wrap">${icon('mail')}
              <input type="email" name="email" autocomplete="username" placeholder="admin@unit.id" required></span>
          </label>
          <label class="field">
            <span>Kata Sandi</span>
            <span class="wrap">${icon('lock')}
              <input type="password" name="pass" autocomplete="current-password" placeholder="Kata sandi admin" required>
              <button type="button" class="eye" data-eye aria-label="Tampilkan kata sandi">${icon('eye-off')}</button>
            </span>
          </label>
          <button class="btn btn--primary btn--lg btn--block" type="submit" data-admin-go>Masuk</button>
        </form>

        <p class="tiny muted tc" style="margin-top:14px">Akun admin dibuat oleh pengelola sistem.
          Lupa kata sandi? Hubungi pengelola sistem untuk mengaturnya ulang.</p>
      </div>
    </div>`, { cls: 'view view--full' });

    bindEye();
    $('#fAdmin').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const email = f.email.value.trim(), pass = f.pass.value;
      if (!email || !pass) { toast('Lengkapi email dan kata sandi.', 'err'); return; }
      if (!TC.FB) { toast('Layanan masuk belum siap. Muat ulang halaman.', 'err'); return; }
      const btn = $('[data-admin-go]');
      btn.classList.add('is-disabled'); btn.textContent = 'Memeriksa…';
      try {
        const au = await TC.FB.signInAdmin(email, pass);
        let u = Object.values(Store.state.users).find((x) => x.adminUid === au.id);
        Store.update((s) => {
          if (!u) {
            const id = uid('u');
            const nama = (au.user_metadata && (au.user_metadata.full_name || au.user_metadata.name)) ||
              (au.email || email).split('@')[0];
            u = { id, name: nama, nickname: nama, email: au.email || email, phone: '', pass: null,
                  role: 'admin-faskes', adminUid: au.id, provider: 'admin', createdAt: Date.now() };
            s.users[id] = u;
          }
          s.onboarded = true;
        });
        Store.masuk(u.id);
        Router.navigate('/faskes', true);
        toast('Masuk sebagai admin.');
      } catch (err) {
        const kode = (err && err.code) || '';
        const pesan = kode === 'BUKAN_ADMIN' ? 'Akun ini bukan akun admin.'
          : /^auth\//.test(kode) ? TC.FB.authError(err)
          : TC.FB.pesanGalat(err);
        toast(pesan, 'err');
        btn.classList.remove('is-disabled'); btn.textContent = 'Masuk';
      }
    };
  }

  /* ---------------- MASUK SEBAGAI TAMU ---------------- */
  /**
   * Akun tamu tanpa data contoh (TC.FITUR.simulasi mati): tanpa perangkat,
   * riwayat, notifikasi, atau identitas dokter/pasien karangan. Nama bisa
   * diubah di Profil → Informasi Pribadi; dokter memakainya pada kode dokter.
   */
  function buatTamuKosong(redirect, role) {
    const id = uid('u');
    const nama = role === 'dokter' ? 'Dokter Tamu' : role === 'admin-faskes' ? 'Pengelola Tamu' : 'Tamu';
    const user = {
      id, name: nama, nickname: nama, email: id + '@tamu.local', phone: '',
      pass: null, role, doctorId: null, facilityId: null,
      createdAt: Date.now(), demo: true
    };
    Store.update((s) => { s.users[id] = user; s.onboarded = true; });
    Store.masuk(id);
    Store.update((s) => { s.profile.nickname = nama; });
    if (redirect === false) return;
    Router.navigate(TC.DATA.role(role).home, true);
    toast('Masuk sebagai tamu · peran ' + TC.DATA.role(role).name + '.');
  }

  function guestSheet() {
    sheet(`
      <h3>Masuk sebagai tamu</h3>
      <p class="sub">${TC.FITUR.simulasi
        ? 'Pilih peran yang ingin Anda coba. Data contoh disiapkan otomatis dan hanya tersimpan di peramban ini.'
        : 'Pilih peran Anda. Akun tamu dimulai kosong — datanya terisi dari pengukuran TeleBand Anda sendiri.'}</p>
      <div class="stack--sm stack">
        ${TC.DATA.ROLES.filter((r) => !TC.peranTersembunyi(r.id)).map((r) => `
          <button class="row" data-role="${r.id}" style="border-radius:16px">
            <span class="row__ico" style="background:${r.color}1a;color:${r.color}">${icon(r.icon)}</span>
            <div style="min-width:0"><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></div>
            ${icon('chev', 'chev')}
          </button>`).join('')}
      </div>`);

    $$('[data-role]').forEach((b) => {
      b.onclick = () => { closeSheet(); seedDemoUser(true, b.dataset.role); };
    });
  }

  /**
   * Membuat akun contoh berisi riwayat agar aplikasi langsung terasa hidup.
   * @param {boolean} redirect  false bila rute pada URL harus dipertahankan —
   *   dipakai saat tautan undangan (#/chat/... atau #/call/...) dibuka di
   *   perangkat yang belum punya akun.
   */
  function seedDemoUser(redirect, role) {
    role = role || 'pasien';
    if (TC.peranTersembunyi(role)) role = 'pasien';
    if (!TC.FITUR.simulasi) { buatTamuKosong(redirect, role); return; }
    const id = uid('u');
    const PROFILES = {
      'pasien':       { name: 'Ayu Prameswari',   nick: 'Ayu',   email: 'ayu@contoh.id' },
      'dokter':       { name: 'dr. Anindya Kusuma, Sp.JP', nick: 'dr. Anindya',
                        email: 'anindya@contoh.id', doctorId: 'd1' },
      'admin-faskes': { name: 'Rudi Hartono',      nick: 'Rudi',  email: 'rudi@contoh.id',
                        facilityId: 'f1' },
      'admin':        { name: 'Sari Widowati',     nick: 'Sari',  email: 'sari@contoh.id' }
    };
    const prof = PROFILES[role] || PROFILES.pasien;
    const user = {
      id, name: prof.name, nickname: prof.nick,
      email: prof.email, phone: '081234567890', pass: 'demo1234',
      role: role, doctorId: prof.doctorId || null, facilityId: prof.facilityId || null,
      createdAt: Date.now(), demo: true
    };
    Store.update((s) => { s.users[id] = user; s.onboarded = true; });
    Store.masuk(id);   // sebelum mengisi profil & riwayat contoh (milik akun ini)
    Store.update((s) => {
      s.profile = Object.assign(s.profile, {
        nickname: prof.nick, gender: 'perempuan', age: 29, height: 162, weight: 57,
        goal: 'gula-stabil',
        targets: TC.DATA.goal('gula-stabil').targets
      });
      // satu TeleBand sudah terpasang (TeleRing tidak lagi dipasangkan: aplikasi
      // kini fokus ke TeleBand)
      const band = {
        id: uid('dev'), type: 'band', name: 'TeleBand', code: TC.Devices.makeCode('TC-BAND'),
        battery: 68, connected: true, pairedAt: Date.now() - 86400000 * 12,
        lastSync: Date.now() - 3600000, rssi: 4
      };
      s.devices = [band];
      s.activeDeviceId = band.id;
      s.pendingSamples = 12;
      s.lastSync = Date.now() - 3600000;

      // beberapa sesi makan terdahulu
      const combos = TC.DATA.FOOD_COMBOS.slice(0, 6);
      s.meals = combos.map((combo, i) => {
        const items = combo.map((n) => ({ n, qty: 1, g: TC.DATA.food(n).g }));
        const nut = TC.Meals.nutrition(items);
        const baseline = TC.rint(84, 95);
        const delta = TC.Meals.predictDelta(nut, items);
        const at = Date.now() - (i * 0.85 + 0.4) * 86400000;
        return {
          id: uid('meal'), at, photo: null,
          kind: TC.Meals.mealKind(new Date(at)).name,
          items, nutrition: nut, confidence: TC.rint(68, 93),
          speed: 1, baseline, predictedDelta: delta,
          status: 'done', doneAt: at + 7200000,
          peak: baseline + delta, peakAt: '+1 jam', delta,
          recovery: delta > 45 ? 3 : delta > 28 ? 2 : 1.5,
          category: delta > 45 ? 'Tinggi' : delta > 28 ? 'Sedang' : 'Landai',
          points: [
            { key: 'baseline', label: 'Baseline', offset: -300000, value: baseline, done: true },
            { key: 't0', label: 'Selesai makan', offset: 0, value: baseline + 8, done: true },
            { key: 'h1', label: '+1 jam', offset: 3600000, value: baseline + delta, done: true },
            { key: 'h2', label: '+2 jam', offset: 7200000, value: baseline + Math.round(delta * 0.28), done: true }
          ]
        };
      });
      // Satu percakapan contoh agar layar konsultasi tidak kosong. Hanya ada
      // di perangkat ini (`local`) — tidak pernah dikirim ke server; memulai
      // chat baru dengan dokter yang sama membuat percakapan sungguhan.
      const t0 = Date.now() - 86400000 * 2;
      s.consults = [{
        id: TC.secureId('cs'), local: true, doctorId: 'd1', mode: 'chat',
        startedAt: t0, status: 'active',
        messages: [
          { from: 'sys', text: 'Konsultasi dimulai. Sampaikan keluhan Anda selengkap mungkin.', at: t0 },
          { from: 'me', kind: 'vitals', text: '', at: t0 + 1000,
            data: { hr: 88, spo2: 97, temp: 36.8, sys: 128, dia: 84, stress: 58, hrv: 34, glucose: 96, at: t0 + 1000 } },
          { from: 'doc', at: t0 + 60000,
            text: 'Selamat datang, saya dr. Anindya Kusuma, Sp.JP. Ada yang bisa saya bantu hari ini? Silakan ceritakan keluhan yang Anda rasakan.' },
          { from: 'me', text: 'Dok, beberapa hari ini saya sering berdebar dan mudah lelah padahal tidak sedang beraktivitas berat.', at: t0 + 180000 },
          { from: 'doc', at: t0 + 260000,
            text: 'Saya sudah melihat ringkasan vital yang Anda kirimkan. Detak jantung istirahat 88 bpm memang sedikit di atas rata-rata Anda sebelumnya, dan HRV-nya turun. Berdebarnya muncul saat istirahat atau setelah aktivitas, dan berapa lama biasanya berlangsung?' },
          { from: 'me', text: 'Biasanya sore hari saat kerja, sekitar 10–15 menit lalu reda sendiri.', at: t0 + 420000 },
          { from: 'doc', at: t0 + 500000,
            text: 'Baik. Polanya konsisten dengan kenaikan beban stres pada rentang tersebut. Untuk sementara, coba rekam EKG lead-I lewat TeleBand tepat saat keluhan muncul, lalu kirimkan ke saya. Bila disertai nyeri dada atau sesak, jangan menunggu — segera ke IGD.' }
        ]
      }];
      s.appointments = [{
        id: 'ap-demo', doctorId: 'd3', at: Date.now() + 86400000 * 2, slot: '15.30',
        note: 'Ingin membahas pola stres sore hari dan kualitas tidur.',
        createdAt: Date.now() - 3600000, status: 'terjadwal'
      }];
      s.notifications = [
        { id: uid('n'), title: 'Sinkronisasi selesai', body: '124 sampel dipindahkan dari TeleBand.', kind: 'ok', at: Date.now() - 3600000, read: false },
        { id: uid('n'), title: 'Detak jantung istirahat naik', body: 'Rata-rata detak jantung istirahat naik 6 bpm dibanding pekan lalu.', kind: 'warn', at: Date.now() - 18000000, read: false }
      ];
    });
    TC.Devices.startBuffer();
    if (redirect === false) return;
    Router.navigate(TC.DATA.role(role).home, true);
    toast('Masuk sebagai tamu · peran ' + TC.DATA.role(role).name + '.');
  }

  /* ---------------- DAFTAR ---------------- */
  function viewRegister() {
    setTopbar('');
    setView(`<div class="auth">
      <div class="auth__top">
        <button class="topbar__back" data-back-onb aria-label="Kembali">${icon('back')}</button>
      </div>
      <div class="auth__body">
        <div class="auth__logo">${logoSvg(62)}</div>
        <h1>Buat Akun TeleCare</h1>
        <p class="sub">Riwayat kesehatan Anda tersimpan pada akun ini</p>

        <form id="fReg" novalidate>
          <label class="field">
            <span>Nama lengkap</span>
            <span class="wrap">${icon('user')}
              <input name="name" type="text" placeholder="Nama sesuai identitas" autocomplete="name" required></span>
          </label>
          <label class="field">
            <span>Email</span>
            <span class="wrap">${icon('mail')}
              <input name="email" type="email" placeholder="nama@email.com" autocomplete="email" required></span>
          </label>
          <label class="field">
            <span>Nomor HP</span>
            <span class="wrap">${icon('phone')}
              <input name="phone" type="tel" placeholder="08xxxxxxxxxx" autocomplete="tel" required></span>
          </label>
          <label class="field">
            <span>Kata sandi</span>
            <span class="wrap">${icon('lock')}
              <input name="pass" type="password" placeholder="Minimal 8 karakter" autocomplete="new-password" required>
              <button type="button" class="eye" data-eye aria-label="Tampilkan kata sandi">${icon('eye-off')}</button>
            </span>
            <span class="hint">Gabungkan huruf besar, huruf kecil, dan angka. Hindari tanggal lahir.</span>
          </label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Daftar</button>
        </form>

        <div class="note note--w mt2">${icon('alert')}
          <div><b>Bukan alat diagnosis</b>TeleCare adalah alat bantu pemantauan gaya hidup.
          Angka yang ditampilkan tidak boleh dipakai untuk mendiagnosis penyakit atau mengubah dosis obat.</div>
        </div>

        <div class="auth__foot">Sudah punya akun? <b data-go-masuk>Masuk di sini</b></div>
      </div>
    </div>`, { cls: 'view view--full' });

    bindEye();
    $('[data-back-onb]').onclick = () => Router.navigate('/mulai');
    $('[data-go-masuk]').onclick = () => Router.navigate('/masuk');

    $('#fReg').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const email = f.email.value.trim();
      const phone = f.phone.value.trim();
      const pass = f.pass.value;

      if (name.length < 3) { toast('Nama terlalu pendek.', 'err'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Format email belum benar.', 'err'); return; }
      if (!/^0\d{8,13}$/.test(phone)) { toast('Nomor HP harus diawali 0 dan 9–14 digit.', 'err'); return; }
      if (pass.length < 8) { toast('Kata sandi minimal 8 karakter.', 'err'); return; }
      if (findUser(email) || findUser(phone)) {
        toast('Email atau nomor tersebut sudah terdaftar di perangkat ini.', 'err'); return;
      }

      const id = uid('u');
      const user = {
        id, name, email, phone, pass,
        nickname: name.split(/\s+/)[0], createdAt: Date.now()
      };
      Store.update((s) => { s.users[id] = user; s.onboarded = true; });
      Store.masuk(id);
      Store.update((s) => { s.profile.nickname = user.nickname; });
      TC.Devices.startBuffer();
      Router.navigate('/lengkapi', true);
      toast('Akun dibuat. Lengkapi data agar target lebih sesuai.');
    };
  }

  /* ---------------- LENGKAPI PROFIL AWAL ---------------- */
  function viewComplete() {
    TC.topbar('Lengkapi Data', { sub: 'Agar target harian sesuai kebutuhan Anda', back: false });
    const p = Store.profile();
    setView(`
      <div class="note note--i">${icon('info')}
        <div><b>Kenapa ini penting</b>Usia, tinggi, dan berat badan dipakai untuk memperkirakan
        kebutuhan energi harian Anda. Selama belum diisi, aplikasi memakai nilai bawaan.</div></div>

      <form id="fComplete" class="mt2">
        <label class="field"><span>Nama panggilan</span>
          <span class="wrap"><input name="nickname" value="${esc(p.nickname || '')}" placeholder="Dipakai pada sapaan di Beranda"></span></label>
        <label class="field"><span>Jenis kelamin</span>
          <span class="wrap"><select name="gender">
            <option value="">Pilih…</option>
            <option value="perempuan"${p.gender === 'perempuan' ? ' selected' : ''}>Perempuan</option>
            <option value="laki-laki"${p.gender === 'laki-laki' ? ' selected' : ''}>Laki-laki</option>
          </select></span></label>
        <div class="grid2">
          <label class="field"><span>Usia (tahun)</span>
            <span class="wrap"><input name="age" type="number" min="5" max="110" value="${p.age || ''}" placeholder="mis. 29"></span></label>
          <label class="field"><span>Tinggi badan (cm)</span>
            <span class="wrap"><input name="height" type="number" min="80" max="230" value="${p.height || ''}" placeholder="mis. 165"></span></label>
        </div>
        <label class="field"><span>Berat badan (kg)</span>
          <span class="wrap"><input name="weight" type="number" min="20" max="250" step="0.1" value="${p.weight || ''}" placeholder="mis. 60"></span>
          <span class="hint">Perbarui kira-kira sebulan sekali agar target tetap masuk akal.</span></label>
        <label class="field"><span>Tingkat aktivitas</span>
          <span class="wrap"><select name="aktivitas">
            <option value="">Belum diisi</option>
            ${TC.Gizi.AKTIVITAS.map((a) => `<option value="${a.id}"${p.aktivitas === a.id ? ' selected' : ''}>${esc(a.nama)} — ${esc(a.desc)}</option>`).join('')}
          </select></span>
          <span class="hint">Menentukan faktor pengali kebutuhan energi harian.</span></label>

        <div class="section-title">${icon('target')} Tujuan kesehatan</div>
        <div class="stack--sm stack" id="goals">
          ${TC.DATA.GOALS.map((g) => `
            <label class="row" style="border-radius:14px;border:1.5px solid ${g.id === p.goal ? 'var(--green-400)' : 'var(--line)'};background:${g.id === p.goal ? 'var(--green-50)' : 'var(--surface)'}">
              <input type="radio" name="goal" value="${g.id}" ${g.id === p.goal ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--green-500)">
              <div><b>${esc(g.name)}</b><small>${esc(g.desc)}</small></div>
            </label>`).join('')}
        </div>

        <button class="btn btn--primary btn--lg btn--block mt2" type="submit">Simpan &amp; Lanjut</button>
        <button class="btn btn--ghost btn--block mt" type="button" data-skip>Lewati dulu</button>
      </form>`);

    $('[data-skip]').onclick = () => Router.navigate('/home', true);
    $('#fComplete').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const goalId = (f.querySelector('input[name=goal]:checked') || {}).value || 'jaga-berat';
      Store.update((s) => {
        Object.assign(s.profile, {
          nickname: f.nickname.value.trim() || s.profile.nickname,
          gender: f.gender.value,
          age: +f.age.value || null,
          height: +f.height.value || null,
          weight: +f.weight.value || null,
          aktivitas: f.aktivitas.value || null,
          goal: goalId,
          diubah: Date.now()
        });
        TC.Gizi.terapkan(s.profile, true);
      });
      toast('Data tersimpan.');
      Router.navigate('/home', true);
    };
  }

  /* ---------------- LUPA KATA SANDI ---------------- */
  function viewForgot() {
    setTopbar('');
    setView(`<div class="auth">
      <div class="auth__top">
        <button class="topbar__back" data-back-login aria-label="Kembali">${icon('back')}</button>
      </div>
      <div class="auth__body">
        <div class="auth__logo">${logoSvg(62)}</div>
        <h1>Pemulihan Kata Sandi</h1>
        <p class="sub">Masukkan email atau nomor yang sama persis dengan saat mendaftar</p>

        <form id="fForgot" novalidate>
          <label class="field"><span>Email atau Nomor HP</span>
            <span class="wrap">${icon('mail')}
              <input name="ident" type="text" placeholder="Identitas terdaftar" required></span></label>
          <div id="step2" hidden>
            <label class="field"><span>Kata sandi baru</span>
              <span class="wrap">${icon('lock')}
                <input name="pass" type="password" placeholder="Minimal 8 karakter">
                <button type="button" class="eye" data-eye aria-label="Tampilkan">${icon('eye-off')}</button></span></label>
          </div>
          <button class="btn btn--primary btn--lg btn--block" type="submit" id="btnForgot">Cari akun saya</button>
        </form>

        <div class="note note--w mt2">${icon('alert')}
          <div><b>Bila email dan nomor sama-sama tidak dapat diakses</b>
          Pemulihan hanya lewat jalur terdaftar. Pastikan email pemulihan Anda selalu aktif.</div></div>
      </div>
    </div>`, { cls: 'view view--full' });

    bindEye();
    $('[data-back-login]').onclick = () => Router.navigate('/masuk');

    let found = null;
    $('#fForgot').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      if (!found) {
        found = findUser(f.ident.value);
        if (!found) { toast('Akun tidak ditemukan di perangkat ini.', 'err'); return; }
        $('#step2').hidden = false;
        $('#btnForgot').textContent = 'Simpan kata sandi baru';
        toast('Akun ditemukan. Silakan buat kata sandi baru.');
        return;
      }
      const pass = f.pass.value;
      if (pass.length < 8) { toast('Kata sandi minimal 8 karakter.', 'err'); return; }
      Store.update((s) => { s.users[found.id].pass = pass; });
      toast('Kata sandi diperbarui. Silakan masuk.');
      Router.navigate('/masuk');
    };
  }

  TC.views = TC.views || {};
  Object.assign(TC.views, {
    loginAdmin: viewLoginAdmin,
    onboard: viewOnboard, login: viewLogin, register: viewRegister,
    complete: viewComplete, forgot: viewForgot, logoSvg, seedDemoUser,
    googleSignIn, adoptGoogleUser
  });
})(window.TC);
