// Supabase Edge Function: deteksi makanan dari foto dengan Google Gemini.
//
// Kunci API TIDAK pernah dikirim ke peramban — disimpan sebagai secret:
//   supabase secrets set GEMINI_API_KEY=...        (wajib)
//   supabase secrets set GEMINI_MODEL=...   (opsional; tanpa ini model flash terbaru dipilih otomatis)
//   supabase functions deploy deteksi-makanan
// (atau lewat Dashboard → Edge Functions → Deploy / Secrets.)
//
// Permintaan (POST, JSON, dengan Authorization Supabase dari aplikasi):
//   { image: "<base64 JPEG tanpa awalan data:>", mime: "image/jpeg",
//     foods: [{ n: "Nasi putih", unit: "centong", g: 120 }, ...] }
// Jawaban:
//   { makanan: [{ nama, porsi, yakin }], lainnya: ["..."], bukanMakanan: bool }
//
// Nama makanan dibatasi ke daftar `foods` lewat enum pada skema respons, jadi
// hasilnya selalu bisa dihitung gizinya oleh aplikasi. Makanan yang tidak ada
// di daftar dilaporkan di `lainnya` agar pengguna bisa memilih padanannya.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const MAKS_GAMBAR = 3_000_000;   // ±2,2 MB biner dalam base64
const PORSI = [0.5, 1, 1.5, 2, 3];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Memilih model otomatis dari daftar model yang tersedia untuk kunci ini.
 * Google berkala mempensiunkan model, jadi nama tetap (mis. gemini-2.5-flash)
 * cepat atau lambat berujung 404. Dipilih model "flash" yang mendukung
 * generateContent: versi stabil lebih dulu, lalu nomor versi tertinggi.
 * Hasilnya disimpan selama instance fungsi hidup.
 */
let modelTerpilih: string | null = null;
let kandidatModel: string[] = [];   // seluruh urutan pilihan, dipakai sebagai cadangan
async function pilihModel(key: string): Promise<string | null> {
  if (modelTerpilih) return modelTerpilih;
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) {
    console.error('Daftar model', r.status, (await r.text()).slice(0, 300));
    return null;
  }
  const d = await r.json();
  const kandidat = (d.models || [])
    .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      /flash/i.test(m.name) && !/(tts|image|audio|live|embed|thinking)/i.test(m.name))
    .map((m: { name: string }) => {
      const nama = m.name.replace(/^models\//, '');
      const versi = parseFloat((/gemini-(\d+(?:\.\d+)?)/.exec(nama) || [])[1] || '0');
      const coba = /(preview|exp|lite)/i.test(nama) ? 1 : 0;   // stabil & penuh lebih dulu
      return { nama, versi, coba };
    })
    .sort((a: { versi: number; coba: number }, b: { versi: number; coba: number }) =>
      a.coba - b.coba || b.versi - a.versi);
  kandidatModel = kandidat.map((k: { nama: string }) => k.nama);
  modelTerpilih = kandidatModel[0] || null;
  console.log('Model terpilih:', modelTerpilih, '· cadangan:', kandidatModel.slice(1, 3).join(', ') || '-');
  return modelTerpilih;
}

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 503 = model sedang penuh, 500 = galat sementara di Google: layak dicoba lagi.
const sementara = (s: number) => s === 503 || s === 500;

/** Pesan galat dari Google (tanpa kunci) supaya penyebabnya terlihat di aplikasi. */
async function pesanGoogle(r: Response): Promise<string> {
  const t = await r.text();
  console.error('Gemini', r.status, t.slice(0, 500));
  try { return (JSON.parse(t).error?.message || '').slice(0, 200); } catch { return ''; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung.' }, 405);

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json({ error: 'GEMINI_API_KEY belum disetel di Supabase secrets.' }, 500);
  // GEMINI_MODEL (opsional) memaksa model tertentu; tanpa itu dipilih otomatis.
  let model = Deno.env.get('GEMINI_MODEL') || await pilihModel(key);
  if (!model) return json({ error: 'Tidak ada model Gemini yang bisa dipakai dengan kunci ini. Periksa kunci di Google AI Studio.' }, 502);

  let body: { image?: string; mime?: string; foods?: { n: string; unit?: string; g?: number }[] };
  try { body = await req.json(); } catch { return json({ error: 'Badan permintaan bukan JSON.' }, 400); }

  const image = typeof body.image === 'string' ? body.image : '';
  const mime = /^image\/(jpeg|png|webp)$/.test(body.mime || '') ? body.mime! : 'image/jpeg';
  const foods = Array.isArray(body.foods) ? body.foods
    .filter((f) => f && typeof f.n === 'string' && f.n.length <= 60).slice(0, 120) : [];
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: 'Gambar tidak valid.' }, 400);
  if (image.length > MAKS_GAMBAR) return json({ error: 'Gambar terlalu besar.' }, 413);
  if (!foods.length) return json({ error: 'Daftar makanan kosong.' }, 400);

  const nama = foods.map((f) => f.n);
  const daftar = foods.map((f) => `- ${f.n} (1 porsi = 1 ${f.unit || 'porsi'}, ±${f.g || '?'} g)`).join('\n');
  const prompt =
    'Anda membantu aplikasi pencatat gizi di Indonesia. Kenali makanan dan minuman pada foto.\n' +
    'Pilih HANYA nama dari daftar berikut, dan perkirakan jumlah porsinya (0.5, 1, 1.5, 2, atau 3) ' +
    'relatif terhadap ukuran porsi yang tertulis:\n' + daftar + '\n' +
    'Makanan yang terlihat tetapi tidak ada di daftar, tulis namanya di "lainnya". ' +
    'Isi "yakin" dengan keyakinan 0–1 per butir. Bila foto bukan makanan, isi bukan_makanan = true ' +
    'dan kosongkan "makanan". Jangan menebak makanan yang tidak terlihat.';

  const schema = {
    type: 'OBJECT',
    properties: {
      makanan: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            nama: { type: 'STRING', enum: nama },
            porsi: { type: 'NUMBER' },
            yakin: { type: 'NUMBER' }
          },
          required: ['nama', 'porsi']
        }
      },
      lainnya: { type: 'ARRAY', items: { type: 'STRING' } },
      bukan_makanan: { type: 'BOOLEAN' }
    },
    required: ['makanan']
  };

  const minta = (m: string) => fetch(`${API}/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: image } }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema }
    })
  });
  let r = await minta(model);
  // 404 = model sudah dipensiunkan/tidak tersedia: pilih ulang dari daftar lalu coba sekali lagi.
  if (r.status === 404) {
    await r.text();
    modelTerpilih = null;
    const pengganti = await pilihModel(key);
    if (pengganti && pengganti !== model) { model = pengganti; r = await minta(model); }
  }
  // 503/500 = Gemini sedang penuh atau galat sementara. Urutannya: coba model
  // yang sama sekali lagi setelah jeda, lalu pindah ke dua model cadangan.
  // Paling banyak 4 percobaan agar pengguna tidak menunggu terlalu lama.
  if (sementara(r.status)) {
    if (!kandidatModel.length) await pilihModel(key);
    const antrean = [model, ...kandidatModel.filter((m) => m !== model).slice(0, 2)];
    for (let i = 0; i < antrean.length && sementara(r.status); i++) {
      console.warn('Gemini', r.status, 'pada', model, '— mencoba', antrean[i]);
      await r.text();
      await tidur(i === 0 ? 1500 : 500);
      model = antrean[i];
      r = await minta(model);
    }
  }
  if (!r.ok) {
    const detail = await pesanGoogle(r);
    if (sementara(r.status)) {
      return json({ error: 'Layanan Gemini sedang sibuk. Coba foto lagi beberapa saat lagi, atau pilih makanan sendiri.' }, 503);
    }
    return json({ error: `Gemini menolak permintaan (${r.status}, model ${model})${detail ? ': ' + detail : '.'}` }, 502);
  }

  let hasil: { makanan?: { nama: string; porsi: number; yakin?: number }[]; lainnya?: string[]; bukan_makanan?: boolean };
  try {
    const d = await r.json();
    const teks = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '{}';
    hasil = JSON.parse(teks);
  } catch {
    return json({ error: 'Jawaban Gemini tidak dapat dibaca.' }, 502);
  }

  // Validasi ulang di server: nama harus ada di daftar, porsi dibulatkan ke
  // pilihan yang tersedia di aplikasi, duplikat digabung.
  const gabung = new Map<string, { nama: string; porsi: number; yakin: number | null }>();
  for (const m of hasil.makanan || []) {
    if (!m || !nama.includes(m.nama)) continue;
    const porsi = PORSI.reduce((a, b) => (Math.abs(b - (+m.porsi || 1)) < Math.abs(a - (+m.porsi || 1)) ? b : a));
    const yakin = typeof m.yakin === 'number' ? Math.max(0, Math.min(1, m.yakin)) : null;
    const ada = gabung.get(m.nama);
    if (ada) ada.porsi = Math.min(3, ada.porsi + porsi);
    else gabung.set(m.nama, { nama: m.nama, porsi, yakin });
  }
  return json({
    makanan: [...gabung.values()],
    lainnya: (hasil.lainnya || []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 10),
    bukanMakanan: !!hasil.bukan_makanan,
    model
  });
});
