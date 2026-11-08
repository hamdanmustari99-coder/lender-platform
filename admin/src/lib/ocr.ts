// Pipeline OCR KTP — PaddleOCR (PP-OCRv6) via onnxruntime-web.
//
// KENAPA PADDLE, BUKAN TESSERACT (keputusan dari pengukuran, bukan selera):
//
//   Pada foto KTP lapangan yang sama (ground truth NIK 3216061301930012):
//     Tesseract + 756 varian crop/threshold/PSM   -> 0 varian dapat 16 digit tepat
//     PaddleOCR 1 pass, tanpa preprocessing apa pun -> NIK TEPAT 16/16
//
//   Invarians Tesseract yang jadi alasan pindah: 12 digit pertama selalu benar,
//   galat SELALU di 4 digit nomor urut ekor. Masalahnya bukan parameter (sudah
//   disapu habis) melainkan model yang tidak punya konteks baris. Paddle
//   mendeteksi baris dulu (det) lalu mengenali per baris (rec), jadi NIK
//   dibaca sebagai satu kesatuan — itu yang membuat digit ekor benar.
//
//   Field lain juga lebih baik: 7/8 field vs 5/11 pada Tesseract, dan
//   confidence dilaporkan per hasil (0.93) sehingga keraguan bisa diukur,
//   bukan ditebak.
//
// YANG DIPERTAHANKAN DARI PIPELINE LAMA:
//   - Deteksi & crop kartu (blueness). Tidak dibutuhkan untuk akurasi, tapi
//     memotong area bukan-KTP memangkas jumlah region yang dideteksi dan
//     ukuran gambar, jadi lebih cepat di HP kelas bawah.
//   - Peta kebingungan karakter untuk jalur NIK (O->0, b->6, l->1). Paddle
//     membaca "3216Ob..." karena font KTP memakai O dan b; normalisasi ini
//     yang mengubahnya jadi angka sah, tanpa mengarang digit.
//   - Parser field satu-baris di sisi UI (NasabahBaru) tetap dipakai.
//
// Aset model dilayani dari /paddle/models/ milik app sendiri: APK harus bisa
// scan tanpa internet. JANGAN set ort.env.wasm.wasmPaths — Vite sudah
// membundel .wasm ORT ke dist/assets/, menimpanya membuat loader mencari
// file yang tidak ada ("both async and sync fetching of the wasm failed").
import { PaddleOcrService } from 'ppu-paddle-ocr/web'

/** Lebar kerja kartu: cukup untuk teks KTP, tidak membebani RAM WebView. */
const CARD_WIDTH = 1600

/** Batas kolom data (kiri) KTP — kolom kanan berisi foto/tanda tangan. */
const TEXT_COLUMN = 0.62

/** Batas piksel aman untuk canvas di WebView low-end (mis. 2 GB RAM). */
const MAX_PIXELS = 12_000_000

/**
 * Peta kebingungan OCR untuk jalur angka.
 * Model PP-OCR membaca glyph KTP apa adanya: huruf O dan b yang bentuknya
 * sama dengan 0 dan 6. Menerjemahkannya SEBELUM validasi membuat NIK
 * "3216Ob1301930012" jadi "3216061301930012" tanpa mengarang digit.
 */
const CONFUSE: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0',
  I: '1', l: '1', i: '1', '|': '1',
  Z: '2', z: '2',
  A: '4',
  S: '5', s: '5',
  b: '6', G: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
}

/** Ubah teks OCR jadi deret digit, memakai peta kebingungan untuk huruf mirip. */
export function digitsOf(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') out += ch
    else out += CONFUSE[ch] ?? ''
  }
  return out
}

/** Gambar + buffer RGBA-nya, supaya deteksi & crop tidak bolak-balik ke canvas. */
interface Raster {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Raster dari bitmap, diskalakan ke lebar target (maks 4x). */
async function rasterFromBitmap(bitmap: ImageBitmap, targetWidth: number): Promise<Raster> {
  const scale = Math.min(targetWidth / bitmap.width, 4)
  let w = Math.max(1, Math.round(bitmap.width * scale))
  let h = Math.max(1, Math.round(bitmap.height * scale))
  if (w * h > MAX_PIXELS) {
    const k = Math.sqrt(MAX_PIXELS / (w * h))
    w = Math.max(1, Math.round(w * k))
    h = Math.max(1, Math.round(h * k))
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D tidak tersedia')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  return { width: w, height: h, data: img.data }
}

/** Resize sebuah raster ke lebar tertentu. */
function resizeRaster(r: Raster, width: number): Raster {
  if (r.width === width) return r
  const scale = width / r.width
  const w = width
  const h = Math.max(1, Math.round(r.height * scale))
  const src = document.createElement('canvas')
  src.width = r.width
  src.height = r.height
  const sctx = src.getContext('2d')
  if (!sctx) throw new Error('Canvas 2D tidak tersedia')
  sctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0)

  const dst = document.createElement('canvas')
  dst.width = w
  dst.height = h
  const dctx = dst.getContext('2d', { willReadFrequently: true })
  if (!dctx) throw new Error('Canvas 2D tidak tersedia')
  dctx.imageSmoothingEnabled = true
  dctx.imageSmoothingQuality = 'high'
  dctx.drawImage(src, 0, 0, w, h)
  return { width: w, height: h, data: dctx.getImageData(0, 0, w, h).data }
}

/** Crop raster dengan koordinat relatif 0..1. */
function cropRaster(r: Raster, x0: number, y0: number, x1: number, y1: number): Raster {
  const sx = Math.max(0, Math.min(r.width - 1, Math.round(x0 * r.width)))
  const sy = Math.max(0, Math.min(r.height - 1, Math.round(y0 * r.height)))
  const ex = Math.max(sx + 1, Math.min(r.width, Math.round(x1 * r.width)))
  const ey = Math.max(sy + 1, Math.min(r.height, Math.round(y1 * r.height)))
  const w = ex - sx
  const h = ey - sy
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcOff = ((sy + y) * r.width + sx) * 4
    out.set(r.data.subarray(srcOff, srcOff + w * 4), y * w * 4)
  }
  return { width: w, height: h, data: out }
}

/**
 * Deteksi pita kartu KTP memakai "kebiruan", bukan tepi.
 * KTP elektronik biru: B - R sekitar +69. Latar khas (kulit, meja kayu, ubin)
 * B - R negatif. Margin lebar, biaya satu pass piksel, tanpa OpenCV.
 */
function detectCardBand(r: Raster): { y0: number; y1: number } | null {
  const { width, height, data } = r
  const rowScore = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0
    let n = 0
    const rowOff = y * width * 4
    for (let x = 0; x < width; x += 4) {
      const i = rowOff + x * 4
      const blueness = data[i + 2] - data[i]
      if (blueness > 25) sum++
      n++
    }
    rowScore[y] = n > 0 ? sum / n : 0
  }
  // Pita = rentang baris terpanjang dengan skor di atas ambang.
  const THRESH = 0.18
  let bestStart = -1
  let bestLen = 0
  let start = -1
  for (let y = 0; y < height; y++) {
    if (rowScore[y] >= THRESH) {
      if (start < 0) start = y
    } else if (start >= 0) {
      if (y - start > bestLen) { bestLen = y - start; bestStart = start }
      start = -1
    }
  }
  if (start >= 0 && height - start > bestLen) { bestLen = height - start; bestStart = start }
  // Kartu KTP harus menempati porsi berarti dari tinggi frame.
  if (bestStart < 0 || bestLen < height * 0.15) return null
  return { y0: bestStart / height, y1: (bestStart + bestLen) / height }
}

/** ArrayBuffer PNG dari raster (Paddle butuh buffer gambar terenkode). */
async function toArrayBuffer(r: Raster): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas')
  canvas.width = r.width
  canvas.height = r.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D tidak tersedia')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Gagal membuat gambar')
  return blob.arrayBuffer()
}

const PROVINCE_CODES: Record<string, string> = {
  'ACEH': '11', 'SUMATERA UTARA': '12', 'SUMATERA BARAT': '13', 'RIAU': '14',
  'JAMBI': '15', 'SUMATERA SELATAN': '16', 'BENGKULU': '17', 'LAMPUNG': '18',
  'KEPULAUAN BANGKA BELITUNG': '19', 'KEPULAUAN RIAU': '21', 'DKI JAKARTA': '31',
  'JAWA BARAT': '32', 'JAWA TENGAH': '33', 'DI YOGYAKARTA': '34', 'JAWA TIMUR': '35',
  'BANTEN': '36', 'BALI': '51', 'NUSA TENGGARA BARAT': '52', 'NUSA TENGGARA TIMUR': '53',
  'KALIMANTAN BARAT': '61', 'KALIMANTAN TENGAH': '62', 'KALIMANTAN SELATAN': '63',
  'KALIMANTAN TIMUR': '64', 'KALIMANTAN UTARA': '65', 'SULAWESI UTARA': '71',
  'SULAWESI TENGAH': '72', 'SULAWESI SELATAN': '73', 'SULAWESI TENGGARA': '74',
  'GORONTALO': '75', 'SULAWESI BARAT': '76', 'MALUKU': '81', 'MALUKU UTARA': '82',
  'PAPUA': '91', 'PAPUA BARAT': '92',
}

/** Cari kode provinsi dari teks KTP ("PROVINSI JAWA BARAT" -> "32"). */
export function extractProvinceCode(text: string): string | null {
  const flat = text.toUpperCase().replace(/\s+/g, ' ')
  const names = Object.keys(PROVINCE_CODES).sort((a, b) => b.length - a.length)
  for (const name of names) {
    if (flat.includes(name)) return PROVINCE_CODES[name]
  }
  return null
}

/** Validasi struktur NIK: 16 digit, tanggal & bulan wajar, bukan 0 berderet. */
export function isValidNik(nik: string): boolean {
  if (!/^\d{16}$/.test(nik)) return false
  if (/^0{6}/.test(nik)) return false
  const dd = Number(nik.slice(6, 8))
  const mm = Number(nik.slice(8, 10))
  const yy = Number(nik.slice(10, 12))
  if (dd < 1 || dd > 31) return false
  if (mm < 1 || mm > 12) return false
  if (yy > 99) return false
  return true
}

export interface OcrResult {
  /** Teks mentah hasil Paddle, baris per baris. */
  text: string
  /** Rata-rata confidence model (0..1) — dipakai UI untuk menandai keraguan. */
  confidence: number
  /** NIK 16 digit yang lolos validasi struktur, bila ada. */
  nik: string | null
  /** true bila kartu terdeteksi & di-crop (indikator kualitas untuk UI). */
  cardDetected: boolean
}

export interface OcrProgress {
  /** 0..1 */
  value: number
  label: string
}

let service: PaddleOcrService | null = null
let initPromise: Promise<PaddleOcrService> | null = null

/**
 * Inisialisasi service sekali, dipakai ulang antar-scan.
 * Kalau init gagal, promise dibuang supaya percobaan berikutnya tidak
 * mewarisi kegagalan yang sama.
 */
async function getService(onProgress?: (p: OcrProgress) => void): Promise<PaddleOcrService> {
  if (service) return service
  if (initPromise) return initPromise

  initPromise = (async () => {
    onProgress?.({ value: 0.12, label: 'Memuat model OCR…' })
    const base = new URL(`${import.meta.env.BASE_URL}paddle/models/`, window.location.href).href
    // WebGPU jauh lebih cepat saat tersedia; WASM jadi fallback. Keduanya
    // single-thread di WebView tanpa COOP/COEP, jadi jangan harap paralel.
    const providers = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm']
    const svc = new PaddleOcrService({
      model: {
        detection: `${base}det.onnx`,
        recognition: `${base}rec.onnx`,
        charactersDictionary: `${base}dict.txt`,
      },
      session: { executionProviders: providers },
      // canvas-native: tanpa OpenCV, jadi tidak ada wasm tambahan (~8 MB)
      // yang harus diunduh. Akurasi deteksi sedikit di bawah OpenCV, tapi
      // deteksi Paddle tetap jauh di atas yang dibutuhkan KTP.
      processing: { engine: 'canvas-native' },
      detection: { maxSideLength: 1600 },
      // charactersDictionary diisi runtime dari model.charactersDictionary;
      // tipe lib mewajibkannya di sini juga, jadi diisi string kosong.
      recognition: { strategy: 'per-line', minimumConfidence: 0.4, charactersDictionary: [] },
    }) as unknown as PaddleOcrService

    try {
      await svc.initialize()
    } catch (e) {
      // WebGPU terdaftar tapi adapter-nya tidak bisa dipakai (umum di emulator
      // dan HP lama). Ulangi murni WASM: lebih lambat, tapi tetap jalan.
      if (!providers.includes('webgpu')) throw e
      const wasmOnly = new PaddleOcrService({
        model: {
          detection: `${base}det.onnx`,
          recognition: `${base}rec.onnx`,
          charactersDictionary: `${base}dict.txt`,
        },
        session: { executionProviders: ['wasm'] },
        processing: { engine: 'canvas-native' },
        detection: { maxSideLength: 1600 },
        recognition: { strategy: 'per-line', minimumConfidence: 0.4, charactersDictionary: [] },
      }) as unknown as PaddleOcrService
      await wasmOnly.initialize()
      service = wasmOnly
      return wasmOnly
    }
    service = svc
    return svc
  })()

  try {
    return await initPromise
  } catch (e) {
    initPromise = null
    throw e
  }
}

/**
 * Pindai foto KTP.
 *
 * Alur: deteksi pita kartu -> crop -> potong kolom kanan yang memuat
 * foto/tanda tangan -> PaddleOCR satu pass -> ambil NIK dari baris yang
 * menyebut "NIK", dengan normalisasi huruf-mirip-angka.
 */
export async function scanKtp(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  onProgress?.({ value: 0.03, label: 'Membaca foto…' })

  const bitmap = await createImageBitmap(file)
  const full = await rasterFromBitmap(bitmap, 1500)
  bitmap.close?.()

  // ---- 1. Deteksi & crop kartu ----
  onProgress?.({ value: 0.08, label: 'Mencari kartu KTP…' })
  const band = detectCardBand(full)
  const cardDetected = Boolean(band)
  const padded = band
    ? cropRaster(full, 0, Math.max(0, band.y0 - 0.012), 1, Math.min(1, band.y1 + 0.012))
    : full
  const card = resizeRaster(padded, CARD_WIDTH)

  // ---- 2. Kolom kanan dibuang ----
  // Foto wajah, tanda tangan, dan masa berlaku ada di kanan. Paddle mendeteksi
  // baris, jadi teks kolom kanan tidak lagi mencemari nilai kiri (masalah khas
  // Tesseract). Tapi memotongnya tetap menghemat inferensi dan mencegah
  // "SEUMUR HIDUP" ikut terbaca sebagai bagian baris alamat.
  onProgress?.({ value: 0.15, label: 'Menyiapkan gambar…' })
  const textArea = cropRaster(card, 0, 0, TEXT_COLUMN + 0.06, 1)

  // ---- 3. OCR ----
  const svc = await getService(onProgress)
  onProgress?.({ value: 0.3, label: 'Memindai teks…' })
  const buffer = await toArrayBuffer(textArea)
  const result = (await svc.recognize(buffer, { flatten: false })) as unknown as {
    text: string
    confidence: number
  }
  const text = result.text ?? ''

  // ---- 4. NIK dari baris yang menyebutnya ----
  onProgress?.({ value: 0.88, label: 'Memeriksa NIK…' })
  let nik: string | null = null

  // Baris NIK dicari dulu: di baris itu angka paling padat, jadi normalisasi
  // huruf-mirip-angka paling aman diterapkan di sana. Di baris lain "O" bisa
  // benar-benar huruf O pada nama.
  const lines = text.split('\n')
  const nikLine = lines.find((l) => /\bNIK\b/i.test(l)) ?? ''
  const candidates: string[] = []
  if (nikLine) {
    const d = digitsOf(nikLine)
    for (let i = 0; i + 16 <= d.length; i++) candidates.push(d.slice(i, i + 16))
  }
  // Fallback: seluruh teks (kalau label NIK tidak terdeteksi sebagai baris).
  if (candidates.length === 0) {
    const d = digitsOf(text)
    for (let i = 0; i + 16 <= d.length; i++) candidates.push(d.slice(i, i + 16))
  }

  const province = extractProvinceCode(text)
  const dobMatch = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
  const dobKey = dobMatch ? `${dobMatch[1]}${dobMatch[2]}${dobMatch[3].slice(2)}` : null

  const valid = candidates.filter(isValidNik)
  if (valid.length) {
    // Utamakan yang tanggal lahirnya cocok dengan field Tempat/Tgl Lahir —
    // ini menolak NIK dari baris lain (mis. nomor RT/RW yang dipanjangkan).
    nik =
      (dobKey && valid.find((v) => v.slice(6, 12) === dobKey)) ??
      valid.find((v) => !province || v.startsWith(province)) ??
      valid[0]
  }

  onProgress?.({ value: 1, label: 'Selesai' })
  return { text, confidence: result.confidence ?? 0, nik, cardDetected }
}

/** Lepas model dari memori (dipanggil saat form ditinggalkan). */
export async function disposeOcr(): Promise<void> {
  const svc = service as unknown as { destroy?: () => Promise<void> } | null
  await svc?.destroy?.().catch(() => undefined)
  service = null
  initPromise = null
}
