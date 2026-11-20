// Speech models in their own process (Electron utilityProcess), so inference and model
// loading never block the main process — which is what made the UI stutter before.
//   in:  Whisper speech-to-text     out: Kokoro neural text-to-speech
// Messages: { id, type: "init" | "warmup" | "transcribe" | "speak", ... } → { id, ok, result | error }
// Progress:  { type: "progress", pct } and { type: "ready" } while models download.

let transformers = null, cacheDir = null;
let asr = null, asrModel = "", asrLoading = null;
let tts = null, ttsLoading = null;

const files = {};
let loading = 0;
const post = (m) => process.parentPort.postMessage(m);

function onDownload(p) {
  if (p.status !== "progress" || !p.total) return;
  files[p.file] = { loaded: p.loaded, total: p.total };
  const all = Object.values(files);
  const loaded = all.reduce((a, x) => a + x.loaded, 0), total = all.reduce((a, x) => a + x.total, 0);
  if (total) post({ type: "progress", pct: Math.floor((loaded / total) * 100) });
}
async function tracked(load) {
  loading++;
  try { return await load(); }
  finally { if (--loading === 0) { for (const k in files) delete files[k]; post({ type: "ready" }); } }
}
async function lib() {
  if (!transformers) {
    transformers = await import("@huggingface/transformers");
    transformers.env.cacheDir = cacheDir;
  }
  return transformers;
}

async function getAsr(model) {
  if (asr && asrModel === model) return asr;
  if (asrLoading) return asrLoading;
  asrLoading = tracked(async () => {
    const { pipeline } = await lib();
    asr = await pipeline("automatic-speech-recognition", model, { progress_callback: onDownload });
    asrModel = model;
    return asr;
  }).finally(() => (asrLoading = null));
  return asrLoading;
}
async function getTts() {
  if (tts) return tts;
  if (ttsLoading) return ttsLoading;
  ttsLoading = tracked(async () => {
    await lib();
    const { KokoroTTS } = await import("kokoro-js");
    tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu", progress_callback: onDownload });
    return tts;
  }).finally(() => (ttsLoading = null));
  return ttsLoading;
}

const handlers = {
  init: async ({ dir }) => { cacheDir = dir; return true; },
  warmup: async ({ speechModel, tts = true }) => { await Promise.all([getAsr(speechModel), ...(tts ? [getTts()] : [])]); return true; },
  transcribe: async ({ audio, speechModel, language }) => {
    const t = await getAsr(speechModel);
    const opts = { chunk_length_s: 30 };
    if (language && language !== "auto") opts.language = language;
    const out = await t(audio instanceof Float32Array ? audio : new Float32Array(audio), opts);
    return (out.text || "").trim();
  },
  speak: async ({ text, voice }) => {
    const t = await getTts();
    const out = await t.generate(String(text).slice(0, 600), { voice: voice || "bm_george", speed: 1.08 });
    const a = out.audio;
    let peak = 0; for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i]));
    if (peak > 0) { const g = 0.95 / peak; for (let i = 0; i < a.length; i++) a[i] *= g; } // loud and clear
    return { sampleRate: out.sampling_rate, audio: a };
  },
};

process.parentPort.on("message", async (e) => {
  const { id, type, ...args } = e.data || {};
  try { post({ id, ok: true, result: await handlers[type](args) }); }
  catch (err) { post({ id, ok: false, error: String(err?.message || err) }); }
});
