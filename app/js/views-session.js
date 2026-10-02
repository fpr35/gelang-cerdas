/* ============================================================
   TeleCare App — views-session.js
   Pencatatan riwayat makanan:
   kamera → pilih/koreksi makanan → tersimpan → rincian gizi.
   (Dulu "sesi makan" dengan titik gula darah 2 jam; sudah dihapus.)
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, $$, esc, icon, clamp, Store, Router, setView, setTopbar, toast,
          hhmm, countdown, sheet, closeSheet, confirmSheet } = TC;
  const D = TC.DATA;
  // Tanpa simulasi (TC.FITUR.simulasi mati): tidak ada pengenalan makanan
  // karangan — foto dikenali Gemini atau makanan dipilih sendiri.
  const SIM = () => !!TC.FITUR.simulasi;

  /* ---------------- 1. KAMERA ---------------- */
  function viewCamera() {
    setTopbar('');
    setView(`
      <div class="cam">
        <div class="cam__stage" id="stage">
          <video id="camVideo" playsinline muted autoplay></video>
          <div class="cam__guide"><i></i><i></i><i></i><i></i></div>
          <div class="cam__top">
            <button class="cam__btn" data-close-cam aria-label="Tutup">${icon('back')}</button>
            <b>${SIM() ? 'Deteksi Makanan' : 'Foto Makanan'}</b>
            ${SIM() ? '' : '<button class="cam__btn" data-skip style="margin-left:auto;width:auto;padding:0 14px;border-radius:99px">Lewati</button>'}
          </div>
          <div class="cam__note" id="camNote">${SIM()
            ? 'Arahkan seluruh piring ke dalam bingkai, ambil dari atas.'
            : 'Foto dikenali otomatis, lalu hasilnya bisa Anda periksa dan koreksi.'}</div>
        </div>
        <div class="cam__bar">
          <button class="cam__btn" data-gallery aria-label="Ambil dari galeri">${icon('gallery')}</button>
          <button class="cam__shutter" data-shoot aria-label="Ambil foto">${icon('cam')}</button>
          <button class="cam__btn" data-flash aria-label="Lampu kilat">${icon('flash')}</button>
        </div>
        <input type="file" accept="image/*" id="fileIn" hidden>
      </div>`, { cls: 'view view--full' });

    const video = $('#camVideo');
    const note = $('#camNote');
    let stream = null;
    let track = null;

    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false
        });
        video.srcObject = stream;
        track = stream.getVideoTracks()[0];
      } catch (err) {
        video.style.display = 'none';
        note.innerHTML = 'Kamera tidak dapat diakses. Gunakan tombol galeri di kiri bawah untuk memilih foto.';
        $('#stage').style.background =
          'radial-gradient(70% 60% at 50% 40%, #0E2B5A, #050F22)';
      }
    }
    startCam();

    function stop() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    Router.onLeave(stop);

    $('[data-close-cam]').onclick = () => { stop(); Router.back('/home'); };

    $('[data-flash]').onclick = async () => {
      if (!track) { toast('Lampu kilat tidak tersedia pada perangkat ini.', 'err'); return; }
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (!caps.torch) { toast('Lampu kilat tidak tersedia pada kamera ini.', 'err'); return; }
      const on = !track._torch;
      try {
        await track.applyConstraints({ advanced: [{ torch: on }] });
        track._torch = on;
        toast(on ? 'Lampu kilat menyala.' : 'Lampu kilat dimatikan.');
      } catch (e) { toast('Lampu kilat gagal dinyalakan.', 'err'); }
    };

    $('[data-gallery]').onclick = () => $('#fileIn').click();
    $('#fileIn').onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const r = new FileReader();
      r.onload = () => analyze(r.result);
      r.readAsDataURL(file);
    };

    $('[data-shoot]').onclick = () => {
      let dataUrl = null;
      if (stream && video.videoWidth) {
        const size = Math.min(video.videoWidth, video.videoHeight);
        const cv = document.createElement('canvas');
        cv.width = cv.height = Math.min(720, size);
        const ctx = cv.getContext('2d');
        ctx.drawImage(video,
          (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size,
          0, 0, cv.width, cv.height);
        dataUrl = cv.toDataURL('image/jpeg', 0.72);
      }
      analyze(dataUrl);
    };

    const skip = $('[data-skip]');
    if (skip) skip.onclick = () => analyze(null);

    function analyze(photo) {
      stop();
      if (!SIM()) { deteksiNyata(photo); return; }
      const stage = $('#stage');
      if (photo) {
        stage.insertAdjacentHTML('afterbegin', `<img src="${photo}" alt="Foto makanan">`);
        video.style.display = 'none';
      }
      stage.insertAdjacentHTML('beforeend', `
        <div class="analyzing">
          <div>
            <svg class="ring" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,.18)" stroke-width="4"/>
              <circle cx="24" cy="24" r="20" stroke="#7FB8F5" stroke-width="4" stroke-linecap="round"
                      stroke-dasharray="32 100">
                <animateTransform attributeName="transform" type="rotate"
                  from="0 24 24" to="360 24 24" dur="1s" repeatCount="indefinite"/>
              </circle></svg>
            <b>Menganalisis makanan…</b>
            <p>Mengenali jenis hidangan dan memperkirakan porsinya</p>
          </div>
        </div>`);

      setTimeout(() => {
        const res = TC.Meals.recognize();
        sessionStorage.setItem('tc.draft', JSON.stringify({
          items: res.items, confidence: res.confidence, photo: photo || null
        }));
        Router.navigate('/sesi/hasil');
      }, 1500);
    }
  }

  /** Memperkecil foto (sisi terpanjang ≤ maks px) sebelum dikirim. */
  function perkecil(dataUrl, maks) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maks / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  /**
   * Deteksi sungguhan lewat Edge Function `deteksi-makanan` (Google Gemini).
   * Hasilnya hanya USULAN: pengguna memeriksa dan mengoreksinya di layar
   * Pilih Makanan sebelum sesi dimulai. Tanpa foto, atau bila deteksi gagal,
   * pengguna memilih makanan sendiri.
   */
  async function deteksiNyata(photo) {
    const draft = { items: [], confidence: null, photo: photo || null, ai: null };
    const simpan = () => {
      sessionStorage.setItem('tc.draft', JSON.stringify(draft));
      Router.navigate('/sesi/hasil');
    };
    if (!photo || !TC.DeteksiDB) { simpan(); return; }

    const stage = $('#stage');
    if (stage) {
      stage.insertAdjacentHTML('afterbegin', `<img src="${photo}" alt="Foto makanan">`);
      const v = $('#camVideo'); if (v) v.style.display = 'none';
      stage.insertAdjacentHTML('beforeend', `
        <div class="analyzing"><div>
          <svg class="ring" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,.18)" stroke-width="4"/>
            <circle cx="24" cy="24" r="20" stroke="#7FB8F5" stroke-width="4" stroke-linecap="round" stroke-dasharray="32 100">
              <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="1s" repeatCount="indefinite"/>
            </circle></svg>
          <b>Mengenali makanan…</b>
          <p>Mengenali jenis hidangan dan memperkirakan porsinya</p>
        </div></div>`);
    }
    try {
      const kecil = (await perkecil(photo, 768)) || photo;
      draft.photo = kecil;
      const h = await TC.DeteksiDB.makanan(kecil, D.FOODS);
      draft.items = (h.makanan || []).map((m) => {
        const f = D.food(m.nama);
        return f ? { n: f.n, qty: m.porsi, g: Math.round(f.g * m.porsi) } : null;
      }).filter(Boolean);
      const yakin = (h.makanan || []).map((m) => m.yakin).filter((x) => typeof x === 'number');
      draft.confidence = yakin.length ? Math.round(yakin.reduce((a, x) => a + x, 0) / yakin.length * 100) : null;
      draft.ai = { lainnya: h.lainnya || [], bukanMakanan: !!h.bukanMakanan };
      if (h.bukanMakanan) toast('Foto tidak tampak seperti makanan. Pilih makanannya sendiri.', 'err');
    } catch (e) {
      draft.ai = { gagal: pesanDeteksi(e) };
      toast('Deteksi otomatis gagal — pilih makanan sendiri.', 'err');
    }
    simpan();
  }

  /**
   * Pesan galat deteksi untuk pengguna. Nama layanan AI di balik deteksi
   * tidak ditampilkan (permintaan user); pesan asli tetap ke konsol.
   */
  function pesanDeteksi(e) {
    const asli = (e && e.message) || '';
    if (asli) console.warn('[TeleCare] deteksi makanan:', asli);
    if (/sibuk|503|high demand/i.test(asli)) return 'Layanan deteksi sedang sibuk. Coba lagi beberapa saat lagi.';
    if (!asli || /gemini|model|kunci|api.?key|secret/i.test(asli)) return 'Layanan deteksi sedang tidak tersedia.';
    return asli;
  }

  /* ---------------- 2. HASIL ANALISIS & KOREKSI ---------------- */
  function readDraft() {
    try { return JSON.parse(sessionStorage.getItem('tc.draft') || 'null'); }
    catch (e) { return null; }
  }
  function writeDraft(d) { sessionStorage.setItem('tc.draft', JSON.stringify(d)); }

  function viewResult() {
    const draft = readDraft();
    if (!draft) { Router.navigate('/sesi/kamera', true); return; }

    TC.topbar(SIM() ? 'Hasil Analisis' : 'Catat Makanan',
      { sub: SIM() ? 'Periksa dan perbaiki sebelum disimpan' : 'Susun isi piring Anda, lalu simpan ke riwayat' });
    // Waktu makan bawaan: sekarang (format datetime-local, waktu setempat).
    const lokal = (t) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
    if (!draft.waktu) draft.waktu = lokal(Date.now());
    draw();

    function fieldWaktu() {
      return `<label class="field mt2"><span>Waktu makan</span>
        <span class="wrap"><input type="datetime-local" id="waktuMakan" value="${esc(draft.waktu)}"
          max="${esc(lokal(Date.now()))}"></span>
        <small>Ubah bila Anda mencatat makanan yang sudah lewat.</small></label>`;
    }

    function simpan() {
      if (!draft.items.length) return;
      const el = $('#waktuMakan');
      const t = el && el.value ? new Date(el.value).getTime() : Date.now();
      const m = TC.Meals.catat(draft.items, draft.photo, isNaN(t) ? Date.now() : t);
      sessionStorage.removeItem('tc.draft');
      toast('Tersimpan di riwayat makanan.');
      Router.navigate('/sesi/' + m.id, true);
    }

    function draw() {
      if (!SIM()) { drawManual(); return; }
      const n = TC.Meals.nutrition(draft.items);
      const conf = draft.confidence;
      const confClass = conf > 80 ? 'g' : conf >= 50 ? 'a' : 'r';
      const confAdvice = conf > 80
        ? 'Biasanya sudah tepat. Periksa sekilas porsinya, lalu lanjutkan.'
        : conf >= 50
          ? 'Periksa setiap baris dan perbaiki yang keliru lewat tombol Koreksi.'
          : 'Sebaiknya ambil ulang foto dengan pencahayaan dan sudut yang lebih baik.';

      setView(`
        ${draft.photo ? `<img src="${draft.photo}" alt="Foto makanan"
          style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--r-lg);border:1px solid var(--line)">` : ''}

        <div class="card mt">
          <div class="card__head">${icon('sparkle')}<h3>Makanan terdeteksi</h3>
            <span class="push"></span><span class="chip chip--${confClass}">Keyakinan ${conf}%</span></div>
          <p class="tiny muted" style="margin-bottom:12px">${esc(confAdvice)}</p>
          <div class="list">
            ${draft.items.map((it, i) => {
              const f = D.food(it.n);
              return `<div class="food-row">
                <span class="food-row__ico">${f ? f.emoji : '🍽️'}</span>
                <div style="min-width:0"><b>${esc(it.n)}</b>
                  <small>${fmtQty(it.qty)} ${esc(f ? f.unit : 'porsi')} · ${it.g} g · ${Math.round((f ? f.c : 0) * it.qty)} g karbo</small></div>
                <button class="btn btn--soft btn--sm edit" data-edit="${i}">${icon('edit')} Koreksi</button>
              </div>`;
            }).join('')}
          </div>
          <button class="btn btn--ghost btn--block mt" data-add>${icon('plus')} Tambah makanan</button>
        </div>

        <div class="section-title">${icon('food')} Rincian gizi</div>
        <div class="nutri6">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>

        ${fieldWaktu()}

        <button class="btn btn--primary btn--lg btn--block mt2" data-start>
          ${icon('check')} Simpan ke riwayat makanan</button>
        <button class="btn btn--ghost btn--block mt" data-retake>${icon('refresh')} Ambil ulang foto</button>
      `);

      $$('[data-edit]').forEach((b) => { b.onclick = () => editItem(+b.dataset.edit); });
      $('[data-add]').onclick = () => addItem();
      $('[data-retake]').onclick = () => Router.navigate('/sesi/kamera');
      $('[data-start]').onclick = simpan;
    }

    /** Tanpa simulasi: daftar makanan diisi pengguna sendiri. */
    function drawManual() {
      const n = TC.Meals.nutrition(draft.items);
      const kosong = !draft.items.length;
      setView(`
        ${draft.photo ? `<img src="${draft.photo}" alt="Foto makanan"
          style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--r-lg);border:1px solid var(--line)">` : ''}

        ${draft.ai && !draft.ai.gagal && !draft.ai.bukanMakanan && draft.items.length ? `
          <div class="note note--i mt">${icon('sparkle')}
            <div><b>Usulan dari deteksi foto${draft.confidence != null ? ' · keyakinan ' + draft.confidence + '%' : ''}</b>
            Dikenali otomatis dari foto. Periksa setiap baris dan ubah porsinya bila keliru — gizi
            dihitung dari daftar di bawah, bukan dari foto.</div></div>` : ''}
        ${draft.ai && draft.ai.lainnya && draft.ai.lainnya.length ? `
          <div class="note note--w mt">${icon('alert')}
            <div><b>Terlihat tetapi tidak ada di daftar makanan</b>${esc(draft.ai.lainnya.join(', '))}.
            Tambahkan padanan yang paling mirip lewat tombol Tambah makanan.</div></div>` : ''}
        ${draft.ai && draft.ai.gagal ? `
          <div class="note note--w mt">${icon('alert')}
            <div><b>Deteksi otomatis tidak berhasil</b>${esc(draft.ai.gagal)} Silakan pilih makanan sendiri.</div></div>` : ''}

        <div class="card mt">
          <div class="card__head">${icon('food')}<h3>Makanan yang Anda santap</h3>
            <span class="push"></span><span class="chip">${draft.items.length} item</span></div>
          ${kosong ? `<p class="small muted">Belum ada makanan. Tambahkan satu per satu beserta porsinya —
            gizinya dihitung dari basis data makanan.</p>` : `<div class="list">
            ${draft.items.map((it, i) => {
              const f = D.food(it.n);
              return `<div class="food-row">
                <span class="food-row__ico">${f ? f.emoji : '🍽️'}</span>
                <div style="min-width:0"><b>${esc(it.n)}</b>
                  <small>${fmtQty(it.qty)} ${esc(f ? f.unit : 'porsi')} · ${it.g} g · ${Math.round((f ? f.c : 0) * it.qty)} g karbo</small></div>
                <button class="btn btn--soft btn--sm edit" data-edit="${i}">${icon('edit')} Ubah</button>
              </div>`;
            }).join('')}
          </div>`}
          <button class="btn ${kosong ? 'btn--primary' : 'btn--ghost'} btn--block mt" data-add>${icon('plus')} Tambah makanan</button>
        </div>

        ${kosong ? '' : `
        <div class="section-title">${icon('food')} Rincian gizi</div>
        <div class="nutri6">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>
        ${kartuPenilaian(n)}`}

        ${fieldWaktu()}

        <button class="btn btn--primary btn--lg btn--block mt2${kosong ? ' is-disabled' : ''}" data-start
          ${kosong ? 'disabled' : ''}>${icon('check')} Simpan ke riwayat makanan</button>
        <button class="btn btn--ghost btn--block mt" data-retake>${icon('cam')} ${draft.photo ? 'Ganti foto' : 'Tambah foto'}</button>
      `);

      $$('[data-edit]').forEach((b) => { b.onclick = () => editItem(+b.dataset.edit); });
      $('[data-add]').onclick = () => addItem();
      $('[data-retake]').onclick = () => Router.navigate('/sesi/kamera');
      $('[data-start]').onclick = simpan;
      // Waktu yang diubah ikut tersimpan di draf, supaya tidak kembali ke
      // "sekarang" saat daftar digambar ulang (tambah/ubah makanan).
      $('#waktuMakan').onchange = (e) => { draft.waktu = e.target.value; writeDraft(draft); };
    }

    function fmtQty(q) {
      return q === 0.5 ? '½' : q === 1 ? '1' : String(q);
    }

    function editItem(i) {
      const it = draft.items[i];
      sheet(`
        <h3>Koreksi makanan</h3>
        <p class="sub">Ubah jenis atau besar porsinya agar perhitungan gizi lebih tepat.</p>
        <label class="field"><span>Jenis makanan</span>
          <span class="wrap"><select id="edName">
            ${D.FOODS.map((f) => `<option value="${esc(f.n)}"${f.n === it.n ? ' selected' : ''}>${f.emoji} ${esc(f.n)}</option>`).join('')}
          </select></span></label>
        <label class="field"><span>Porsi</span>
          <span class="wrap"><select id="edQty">
            ${[0.5, 1, 1.5, 2, 3].map((q) => `<option value="${q}"${q === it.qty ? ' selected' : ''}>${fmtQty(q)} porsi</option>`).join('')}
          </select></span></label>
        <div class="stack--sm stack mt">
          <button class="btn btn--primary btn--block" id="edSave">Simpan perubahan</button>
          <button class="btn btn--dangerSoft btn--block" id="edDel">${icon('trash')} Hapus dari daftar</button>
        </div>`);
      $('#edSave').onclick = () => {
        const name = $('#edName').value;
        const qty = +$('#edQty').value;
        const f = D.food(name);
        draft.items[i] = { n: name, qty, g: Math.round(f.g * qty) };
        if (draft.confidence != null) draft.confidence = Math.min(97, draft.confidence + 6);
        writeDraft(draft); closeSheet(); draw();
        toast('Koreksi tersimpan.');
      };
      $('#edDel').onclick = () => {
        draft.items.splice(i, 1);
        if (!draft.items.length && SIM()) { closeSheet(); toast('Daftar kosong, ambil ulang foto.', 'err'); Router.navigate('/sesi/kamera'); return; }
        writeDraft(draft); closeSheet(); draw();
      };
    }

    function addItem() {
      sheet(`
        <h3>Tambah makanan</h3>
        <p class="sub">${SIM() ? 'Tambahkan hidangan yang tidak terdeteksi dari foto.' : 'Pilih hidangan dan besar porsinya.'}</p>
        <label class="field"><span>Jenis makanan</span>
          <span class="wrap"><select id="adName">
            ${D.FOODS.map((f) => `<option value="${esc(f.n)}">${f.emoji} ${esc(f.n)}</option>`).join('')}
          </select></span></label>
        <label class="field"><span>Porsi</span>
          <span class="wrap"><select id="adQty">
            ${[0.5, 1, 1.5, 2].map((q) => `<option value="${q}"${q === 1 ? ' selected' : ''}>${fmtQty(q)} porsi</option>`).join('')}
          </select></span></label>
        <button class="btn btn--primary btn--block mt" id="adSave">Tambahkan</button>`);
      $('#adSave').onclick = () => {
        const name = $('#adName').value, qty = +$('#adQty').value;
        const f = D.food(name);
        draft.items.push({ n: name, qty, g: Math.round(f.g * qty) });
        writeDraft(draft); closeSheet(); draw();
        toast(name + ' ditambahkan.');
      };
    }
  }

  /* ---------------- 3. PENILAIAN GIZI SESUAI TUJUAN ----------------
     Seberapa besar satu kali makan memenuhi kebutuhan harian, dan apa
     artinya bagi tujuan kesehatan pengguna (Meals.nilaiMakanan). */
  const IKON_CATATAN = { baik: 'check', awas: 'alert', info: 'info' };
  function kartuPenilaian(n) {
    const p = Store.profile();
    const nilai = TC.Meals.nilaiMakanan(n, p.targets, p.goal);
    return `<div class="card mt">
      <div class="card__head">${icon('target')}<h3>Sesuai kebutuhan Anda</h3>
        <span class="push"></span><span class="chip chip--b">${esc(D.goal(p.goal).name)}</span></div>
      ${nilai.porsi.map((b) => `
        <div class="macro">
          <b>${esc(b.label)}</b>
          <span class="num">${b.nilai}<s> ${esc(b.unit)} · ${b.pct}% kebutuhan harian</s></span>
        </div>
        <div class="bar"><i style="width:${clamp(b.pct, 0, 100)}%"></i></div>`).join('')}
      <div class="stack--sm stack mt">
        ${nilai.catatan.map((c) => `<div class="note note--${c.jenis === 'awas' ? 'w' : 'i'}">${icon(IKON_CATATAN[c.jenis])}
          <div>${esc(c.teks)}</div></div>`).join('')}
      </div>
      <p class="tiny muted" style="margin-top:8px">Kebutuhan harian: ${p.targets.kcal} kkal · karbo ${p.targets.carb} g ·
        protein ${p.targets.protein} g · lemak ${p.targets.fat} g. <a class="link" href="#/profil/tujuan">Ubah tujuan</a></p>
    </div>`;
  }

  /* ---------------- 4. RINCIAN MAKANAN ---------------- */
  function viewSummary(params) {
    const m = Store.state.meals.find((x) => x.id === params.id);
    if (!m) { Router.navigate('/riwayat', true); return; }
    const n = m.nutrition;
    const pr = TC.Meals.progresTarget(Store.state.meals, null, Store.profile().targets, Store.profile().goal, m.at);
    const hariIni = new Date(m.at).toDateString() === new Date().toDateString();
    if (!hariIni) pr.saran = '';   // saran harian hanya bermakna untuk hari ini

    TC.topbar('Rincian Makanan', { sub: TC.shortDate(new Date(m.at)) + ' · ' + m.kind });
    setView(`
      <div class="card">
        <div class="session-card">
          ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${icon('food')}</span>`}
          <div style="min-width:0">
            <b>${esc(m.items.map((i) => i.n).join(' & '))}</b>
            <small>${icon('clock')} ${hhmm(new Date(m.at))} · ${esc(m.kind)}</small>
          </div>
        </div>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('food')}<h3>Gizi makanan ini</h3></div>
        <div class="nutri6">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>
        <div class="list mt">
          ${m.items.map((it) => {
            const f = D.food(it.n);
            return `<div class="food-row">
              <span class="food-row__ico">${f ? f.emoji : '🍽️'}</span>
              <div><b>${esc(it.n)}</b><small>${it.g} g · ${f ? Math.round(f.kcal * it.qty) : '—'} kkal ·
                ${Math.round((f ? f.p : 0) * it.qty)} g protein · ${Math.round((f ? f.c : 0) * it.qty)} g karbo</small></div>
            </div>`;
          }).join('')}
        </div>
      </div>

      ${kartuPenilaian(n)}

      <div class="section-title">${icon('food')} Total ${hariIni ? 'hari ini' : TC.shortDate(new Date(m.at))}</div>
      ${TC.views.kartuTarget(pr, { hari: hariIni ? 'hari ini' : 'hari itu' })}

      <button class="btn btn--dangerSoft btn--block mt2" data-hapus>${icon('trash')} Hapus dari riwayat</button>
    `);

    $('[data-hapus]').onclick = async () => {
      const ok = await confirmSheet({
        title: 'Hapus catatan makanan ini?',
        body: 'Catatan dihapus dari riwayat dan tidak lagi dihitung dalam asupan harian.',
        ok: 'Hapus', danger: true
      });
      if (!ok) return;
      TC.Meals.hapus(m.id);
      toast('Catatan makanan dihapus.');
      Router.navigate('/riwayat', true);
    };
  }

  TC.views = TC.views || {};
  Object.assign(TC.views, {
    camera: viewCamera, result: viewResult, summary: viewSummary
  });
})(window.TC);
