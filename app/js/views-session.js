/* ============================================================
   TeleCare App — views-session.js
   Rangkaian pencatatan sesi makan:
   kamera → hasil analisis & koreksi → sesi berjalan → ringkasan.
   ============================================================ */
(function (TC) {
  'use strict';

  const { $, $$, esc, icon, clamp, Store, Router, setView, setTopbar, toast,
          hhmm, countdown, sheet, closeSheet, confirmSheet } = TC;
  const D = TC.DATA;
  // Tanpa simulasi (TC.FITUR.simulasi mati): tidak ada pengenalan makanan
  // karangan — foto hanya lampiran, makanan dipilih sendiri, dan titik gula
  // darah diisi hasil ukur TeleBand (lihat Meals di engine.js).
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
            : 'Foto hanya sebagai lampiran catatan. Anda memilih makanannya sendiri di langkah berikut.'}</div>
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
          'radial-gradient(70% 60% at 50% 40%, #0B3327, #04140F)';
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
      if (!SIM()) {
        sessionStorage.setItem('tc.draft', JSON.stringify({ items: [], confidence: null, photo: photo || null }));
        Router.navigate('/sesi/hasil');
        return;
      }
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
              <circle cx="24" cy="24" r="20" stroke="#6FD3A6" stroke-width="4" stroke-linecap="round"
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

  /* ---------------- 2. HASIL ANALISIS & KOREKSI ---------------- */
  function readDraft() {
    try { return JSON.parse(sessionStorage.getItem('tc.draft') || 'null'); }
    catch (e) { return null; }
  }
  function writeDraft(d) { sessionStorage.setItem('tc.draft', JSON.stringify(d)); }

  function viewResult() {
    const draft = readDraft();
    if (!draft) { Router.navigate('/sesi/kamera', true); return; }

    TC.topbar(SIM() ? 'Hasil Analisis' : 'Pilih Makanan',
      { sub: SIM() ? 'Periksa dan perbaiki sebelum sesi dimulai' : 'Susun isi piring Anda sebelum sesi dimulai' });
    draw();

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

        <div class="section-title">${icon('food')} Rincian gizi sesi</div>
        <div class="nutri6">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>

        <div class="note note--i mt2">${icon('watch')}
          <div><b>Tekan tombol Selesai Makan di jam</b>
          Sesi dimulai begitu tombolnya ditekan, memakai waktu jam — bukan waktu ponsel.</div></div>

        <button class="btn btn--primary btn--lg btn--block mt2" data-start>
          ${icon('check')} Mulai sesi sekarang</button>
        <button class="btn btn--ghost btn--block mt" data-retake>${icon('refresh')} Ambil ulang foto</button>

        <p class="tiny muted tc mt">Mode purwarupa: menekan tombol di atas setara dengan menekan
        tombol <b>Selesai Makan</b> pada perangkat.</p>
      `);

      $$('[data-edit]').forEach((b) => { b.onclick = () => editItem(+b.dataset.edit); });
      $('[data-add]').onclick = () => addItem();
      $('[data-retake]').onclick = () => Router.navigate('/sesi/kamera');
      $('[data-start]').onclick = () => {
        const speed = Store.state.settings.fastDemo;
        TC.Meals.create(draft.items, draft.photo, { confidence: draft.confidence });
        sessionStorage.removeItem('tc.draft');
        toast(speed ? 'Sesi dimulai — waktu dipercepat untuk demo.' : 'Sesi dimulai. Titik berikutnya dalam 1 jam.');
        Router.navigate('/sesi/berjalan', true);
      };
    }

    /** Tanpa simulasi: daftar makanan diisi pengguna sendiri. */
    function drawManual() {
      const n = TC.Meals.nutrition(draft.items);
      const kosong = !draft.items.length;
      setView(`
        ${draft.photo ? `<img src="${draft.photo}" alt="Foto makanan"
          style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--r-lg);border:1px solid var(--line)">` : ''}

        <div class="card ${draft.photo ? 'mt' : ''}">
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
        <div class="section-title">${icon('food')} Rincian gizi sesi</div>
        <div class="nutri6">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>`}

        <div class="note note--i mt2">${icon('watch')}
          <div><b>Gula darah diukur dengan TeleBand</b>
          Ukur sekali sebelum makan (hingga 30 menit sebelum sesi dimulai), lalu sekitar 1 jam dan
          2 jam sesudahnya. Titik yang tidak diukur pada waktunya ditandai terlewat. Glukosa TeleBand
          adalah estimasi eksperimental.</div></div>

        <button class="btn btn--primary btn--lg btn--block mt2${kosong ? ' is-disabled' : ''}" data-start
          ${kosong ? 'disabled' : ''}>${icon('check')} Mulai sesi sekarang</button>
        <button class="btn btn--ghost btn--block mt" data-retake>${icon('cam')} ${draft.photo ? 'Ganti foto' : 'Tambah foto'}</button>
      `);

      $$('[data-edit]').forEach((b) => { b.onclick = () => editItem(+b.dataset.edit); });
      $('[data-add]').onclick = () => addItem();
      $('[data-retake]').onclick = () => Router.navigate('/sesi/kamera');
      $('[data-start]').onclick = () => {
        if (!draft.items.length) return;
        const m = TC.Meals.create(draft.items, draft.photo);
        sessionStorage.removeItem('tc.draft');
        toast(m.points[0].done
          ? 'Sesi dimulai. Titik sebelum makan terisi dari hasil ukur barusan.'
          : 'Sesi dimulai. Ukur dengan TeleBand sekarang untuk titik sebelum makan.');
        Router.navigate('/sesi/berjalan', true);
      };
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

  /* ---------------- 3. SESI BERJALAN ---------------- */
  function viewRunning() {
    const m = Store.state.activeMeal;
    if (!m) { Router.navigate('/home', true); return; }

    TC.topbar('Sesi Berjalan', { sub: m.kind + ' · mulai ' + hhmm(new Date(m.at)) });
    const n = m.nutrition;

    setView(`
      ${TC.views.deviceBar()}

      <div class="card mt">
        <div class="card__head">${icon('chart')}<h3>Titik Pengukuran</h3>
          <span class="push"></span><span class="chip chip--g"><i class="dotlive"></i> Sesi berjalan</span></div>
        <div class="points" id="points"></div>
        <p class="tiny muted mt">${m.v === 2
          ? 'Setiap titik terisi dari hasil ukur TeleBand yang selesai di dalam jendela waktunya. Glukosa TeleBand adalah estimasi eksperimental.'
          : m.speed > 1
          ? 'Mode demo: rentang 2 jam dipadatkan menjadi sekitar 2 menit.'
          : 'Titik pengukuran mengikuti waktu sesungguhnya.'}</p>
        ${m.v === 2 ? `<a class="btn btn--primary btn--block mt" href="#/teleband" data-ukur hidden>
          ${icon('heart')} Ukur sekarang dengan TeleBand</a>` : ''}
      </div>

      <div class="card mt">
        <div class="session-card">
          ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${icon('food')}</span>`}
          <div style="min-width:0">
            <b>${esc(m.items.map((i) => i.n).join(' & '))}</b>
            <small>Selesai makan ${hhmm(new Date(m.at))}</small>
          </div>
        </div>
        <div class="nutri6 mt">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>
      </div>

      <div class="note note--i mt">${icon('info')}
        <div><b>Data yang datang terlambat bukan kegagalan</b>
        ${m.v === 2
          ? 'TeleBand menyimpan hasil ukur yang belum terkirim. Selama sesi masih berjalan, hasil itu tetap mengisi titiknya setelah TeleBand tersambung lagi — menurut waktu pengukurannya di alat.'
          : 'Perangkat menyimpan sampel di buffer, sehingga sebuah titik dapat terisi setelah sinkronisasi.'}</div></div>

      <button class="btn btn--dangerSoft btn--block mt2" data-cancel>${icon('x')} Batalkan sesi</button>
    `);

    TC.views.bindDeviceBar($('#view'));

    function drawPoints() {
      const meal = Store.state.activeMeal;
      if (!meal) { Router.navigate('/home', true); return; }
      if (meal.v === 2) { drawPointsNyata(meal); return; }
      $('#points').innerHTML = meal.points.map((p) => {
        const due = TC.Meals.pointDue(meal, p);
        const left = due - Date.now();
        return `<div class="point${p.done ? ' is-done' : ''}">
          <span class="point__st">${icon(p.done ? 'check' : 'clock')}</span>
          <div><b>${esc(p.label)}</b><small>${hhmm(new Date(due))}</small></div>
          ${p.done
            ? `<span class="val">${p.value}<u>mg/dL</u></span>`
            : `<span class="cd">${countdown(left)}</span>`}
        </div>`;
      }).join('');
    }

    /** Titik sesi nyata: terisi, terlewat, sedang dibuka (ukur sekarang), atau nanti. */
    function drawPointsNyata(meal) {
      const now = Date.now();
      let adaSekarang = false;
      $('#points').innerHTML = meal.points.map((p) => {
        const st = TC.Meals.statusTitik(meal, p, now);
        if (st === 'sekarang') adaSekarang = true;
        const buka = meal.at + p.dari, tutup = meal.at + p.sampai;
        const kanan = st === 'terisi' ? `<span class="val">${p.value}<u>mg/dL</u></span>`
          : st === 'terlewat' ? `<span class="chip">terlewat</span>`
          : st === 'sekarang' ? `<span class="chip chip--g">ukur s.d. ${hhmm(new Date(tutup))}</span>`
          : `<span class="cd">${countdown(buka - now)}</span>`;
        return `<div class="point${p.done ? ' is-done' : ''}">
          <span class="point__st">${icon(st === 'terisi' ? 'check' : st === 'terlewat' ? 'x' : 'clock')}</span>
          <div><b>${esc(p.label)}</b><small>${hhmm(new Date(buka))}–${hhmm(new Date(tutup))}</small></div>
          ${kanan}
        </div>`;
      }).join('');
      const tombol = $('[data-ukur]');
      if (tombol) tombol.hidden = !adaSekarang;
    }

    drawPoints();
    const t = setInterval(() => {
      if (TC.Meals.tick()) {
        if (!Store.state.activeMeal) {
          clearInterval(t);
          const last = Store.state.meals[0];
          toast('Sesi selesai. Ringkasan siap dibaca.');
          Router.navigate('/sesi/' + last.id, true);
          return;
        }
      }
      drawPoints();
    }, 1000);
    Router.onLeave(() => clearInterval(t));

    $('[data-cancel]').onclick = async () => {
      const ok = await confirmSheet({
        title: 'Batalkan sesi ini?',
        body: 'Titik yang sudah terkumpul akan dibuang dan sesi tidak masuk ke riwayat.',
        ok: 'Ya, batalkan', danger: true
      });
      if (ok) { TC.Meals.cancel(); toast('Sesi dibatalkan.'); Router.navigate('/home', true); }
    };
  }

  /* ---------------- 4. RINGKASAN SESI ---------------- */
  function viewSummary(params) {
    const m = Store.state.meals.find((x) => x.id === params.id);
    if (!m) { Router.navigate('/riwayat', true); return; }

    if (m.v === 2 && m.delta == null) { summaryKurang(m); return; }
    const n = m.nutrition;
    const measured = m.points.filter((p) => p.value != null).length;
    const catClass = m.delta > 45 ? 'r' : m.delta > 28 ? 'a' : 'g';
    const pulihTeks = m.v === 2
      ? (m.pulih2jam == null ? 'titik +2 jam tidak terukur' : m.pulih2jam ? 'kembali dekat awal dalam 2 jam' : 'belum kembali dalam 2 jam')
      : 'kembali normal dalam ' + m.recovery + ' jam';

    TC.topbar('Ringkasan Sesi', { sub: TC.shortDate(new Date(m.at)) + ' · ' + m.kind });
    setView(`
      <div class="card">
        <div class="session-card">
          ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${icon('food')}</span>`}
          <div style="min-width:0">
            <b>${esc(m.items.map((i) => i.n).join(' & '))}</b>
            <small>${icon('clock')} ${hhmm(new Date(m.at))} · ${esc(m.kind)}</small>
            <span class="chip chip--${catClass}" style="margin-top:6px">${esc(m.category)}</span>
          </div>
        </div>

        <div class="mt" style="padding-top:14px;border-top:1px solid var(--line)">
          <div style="font-size:2.2rem;font-weight:800;letter-spacing:-.04em;line-height:1">
            +${m.delta}<span style="font-size:.4em;color:var(--muted);font-weight:700"> mg/dL</span></div>
          <p class="tiny muted">kenaikan puncak dari ${m.v === 2 ? 'sebelum makan' : 'baseline'} ${m.baseline} mg/dL</p>
          <p class="small mt" style="color:var(--ink-2)">
            puncak +${m.delta} mg/dL · ${esc(pulihTeks)}</p>
        </div>
      </div>

      <div class="metric3 mt">
        <div><span>↑ Puncak</span><b>${m.peak}</b><small>mg/dL di ${esc(m.peakAt || '+1 jam')}</small></div>
        <div><span>↕ Delta</span><b>+${m.delta}</b><small>mg/dL dari ${m.baseline}</small></div>
        <div><span>↺ Pemulihan</span><b>${m.v === 2 ? (m.pulih2jam == null ? '—' : m.pulih2jam ? '≤ 2 jam' : '> 2 jam') : m.recovery + ' jam'}</b><small>${m.v === 2 ? 'dari titik +2 jam' : 'setelah t0'}</small></div>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('drop')}<h3>Respons Gula Darah</h3></div>
        <p class="tiny muted" style="margin-top:-6px;margin-bottom:10px">
          ${measured} dari ${m.points.length} titik terukur · ${m.v === 2 ? 'sebelum makan' : 'baseline'} ${m.baseline} mg/dL
          ${m.v === 2 ? '· estimasi eksperimental TeleBand' : ''}</p>
        <div class="chart-wrap"><canvas id="cResp" style="height:190px"></canvas></div>
      </div>

      <div class="card mt">
        <div class="card__head">${icon('food')}<h3>Nutrisi Sesi Ini</h3></div>
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
              <div><b>${esc(it.n)}</b><small>${it.g} g · ${Math.round((f ? f.c : 0) * it.qty)} g karbo</small></div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="insight mt">
        <div class="insight__glow"></div>
        <div class="tag">${icon('sparkle')} Catatan TeleCare AI</div>
        <h5>${esc(curveTitle(m))}</h5>
        <p>${esc(curveNote(m))}</p>
      </div>

      <div class="note note--d mt">${icon('alert')}
        <div><b>Angka sesi bukan hasil pemeriksaan darah</b>
        ${m.v === 2 ? 'Gula darah adalah estimasi eksperimental TeleBand dari sinyal PPG jari, bukan laboratorium.'
          : 'Seluruh nilai dihitung dari sensor dan catatan asupan Anda, bukan laboratorium.'}
        Tidak dapat dipakai untuk menegakkan diagnosis maupun mengubah pengobatan.</div></div>

      ${TC.FITUR.konsultasi ? `<div class="grid2 mt2">
        <a class="btn btn--primary btn--block" href="#/konsultasi">Diskusikan ke dokter ${icon('arrow')}</a>
        <button class="btn btn--ghost btn--block" data-share>${icon('link')} Lampirkan ke konsultasi</button>
      </div>` : ''}
    `);

    const cv = $('#cResp');
    const vals = m.points.map((p) => p.value);
    TC.lineChart(cv, [
      { data: vals, color: '#049A5B', fill: true, dots: true },
      { data: vals.map(() => m.baseline), color: '#A9E5C8', dash: [5, 5], smooth: false }
    ], { xLabels: m.points.map((p) => p.label) });

    const share = $('[data-share]');
    if (share) share.onclick = () => {
      sessionStorage.setItem('tc.attachMeal', m.id);
      toast('Sesi akan dilampirkan pada konsultasi berikutnya.');
      Router.navigate('/konsultasi');
    };
  }

  /** Ringkasan sesi nyata yang titik gula darahnya tidak cukup. */
  function summaryKurang(m) {
    const n = m.nutrition;
    TC.topbar('Ringkasan Sesi', { sub: TC.shortDate(new Date(m.at)) + ' · ' + m.kind });
    setView(`
      <div class="card">
        <div class="session-card">
          ${m.photo ? `<img src="${m.photo}" alt="">` : `<span class="ph">${icon('food')}</span>`}
          <div style="min-width:0">
            <b>${esc(m.items.map((i) => i.n).join(' & '))}</b>
            <small>${icon('clock')} ${hhmm(new Date(m.at))} · ${esc(m.kind)}</small>
            <span class="chip" style="margin-top:6px">Data kurang</span>
          </div>
        </div>
      </div>

      <div class="note note--w mt">${icon('alert')}
        <div><b>Kenaikan gula darah tidak dapat dihitung</b>
        Butuh hasil ukur TeleBand sebelum makan dan minimal satu sesudahnya (+1 atau +2 jam).
        Titik terukur: ${m.points.filter((p) => p.value != null).map((p) => esc(p.label) + ' ' + p.value + ' mg/dL').join(', ') || 'tidak ada'}.</div></div>

      <div class="card mt">
        <div class="card__head">${icon('food')}<h3>Nutrisi Sesi Ini</h3></div>
        <div class="nutri6">
          <div><span>${icon('fire')} Kalori</span><b>${n.kcal}<u>kkal</u></b></div>
          <div><span>🌾 Karbohidrat</span><b>${n.carb}<u>g</u></b></div>
          <div><span>🥚 Protein</span><b>${n.protein}<u>g</u></b></div>
          <div><span>🥑 Lemak</span><b>${n.fat}<u>g</u></b></div>
          <div><span>🍬 Gula total</span><b>${n.sugar}<u>g</u></b></div>
          <div><span>🌿 Serat</span><b>${n.fiber}<u>g</u></b></div>
        </div>
      </div>`);
  }

  function curveTitle(m) {
    if (m.delta > 45) return 'Kenaikan tajam pada sesi ini';
    if (m.delta > 28) return 'Kenaikan sedang, pemulihan wajar';
    return 'Kurva landai — pola yang baik';
  }
  function curveNote(m) {
    const carb = m.nutrition.carb, fiber = m.nutrition.fiber;
    if (m.delta > 45) {
      return `Porsi karbohidrat pada sesi ini ${carb} g dengan serat ${fiber} g. Kombinasi itu cenderung ` +
        'memberi lonjakan besar. Coba dahulukan sayur dan lauk sebelum sumber karbohidrat pada sesi berikutnya, ' +
        'lalu bandingkan hasilnya.';
    }
    if (m.delta > 28) {
      return `Respons berada di rentang menengah dengan ${carb} g karbohidrat. Amati apakah pola ini berulang ` +
        'pada menu serupa selama beberapa hari sebelum menyimpulkan.';
    }
    return `Dengan ${carb} g karbohidrat dan ${fiber} g serat, respons tubuh Anda pada sesi ini tergolong landai. ` +
      'Menu seperti ini layak diulang bila tujuan Anda menjaga kestabilan gula darah.';
  }

  TC.views = TC.views || {};
  Object.assign(TC.views, {
    camera: viewCamera, result: viewResult, running: viewRunning, summary: viewSummary
  });
})(window.TC);
