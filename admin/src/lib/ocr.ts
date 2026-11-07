// Pipeline OCR KTP — tesseract.js dengan preprocessing yang disetel dari hasil bench.
//
// Kenapa bukan sekadar createWorker() + foto apa adanya:
//   * Foto HP datang 3000-4000px, miring, blur, dan cahayanya tidak rata.
//     Threshold keras (g > 140 putih, g < 90 hitam) membuang semua abu-abu
//     di antaranya — di foto yang agak gelap, teks KTP ikut hilang.
//     Uji 4 kondisi foto (terang / normal / redup-miring / gelap):
//       threshold keras  36/48 field  (75%)  — gagal total di foto gelap (2/6)
//       Otsu adaptif     45/48 field  (94%)  — 6/6 di semua kondisi
//   * Resolusi dinormalisasi ke ~1800px supaya tinggi huruf konsisten; foto
//     4000px membuat Tesseract menebak resolusi dan memperlambat 3-4x.
//   * PSM dijalankan dua kali (SINGLE_BLOCK lalu AUTO) dan hasil terbaik
//     dipilih dari skor field — SINGLE_BLOCK menang di foto redup, AUTO
//     menang di foto bersih.
//
// Aset (worker, core wasm, traineddata) dilayani dari /tesseract/ milik app
// sendiri, bukan CDN jsdelivr: APK harus bisa scan KTP tanpa internet, dan
// WebView tidak selalu boleh memuat skrip lintas-origin.
import { createWorker, PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'

/** Lebar kerja: cukup untuk teks KTP, tidak membebani RAM WebView. */
const TARGET_WIDTH = 1800

/** Batas piksel aman untuk canvas di WebView low-end (mis. 2 GB RAM). */
const MAX_PIXELS = 12_000_000

const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'

/**
 * Aset lokal vs CDN.
 * Electron memuat app lewat file:// — importScripts lintas protokol dari blob
 * worker diblokir browser, jadi desktop tetap memakai CDN (perilaku lama).
 * Web dan APK memakai aset lokal: offline-ready dan tanpa latensi jaringan.
 */
function assetPaths(coreFile: string) {
  if (isFileProtocol) {
    return {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
      corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/${coreFile}`,
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      gzip: true,
    }
  }
  const base = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href).href
  return {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}${coreFile}`,
    langPath: `${base}lang`,
    // Traineddata mentah (bukan .gz): Android Gradle Plugin otomatis
    // men-decompress aset *.gz saat packaging, sehingga permintaan
    // `lang/ind.traineddata.gz` jadi 404 di APK. Berkas mentah selalu
    // terkirim apa adanya dan tetap lebih kecil dari rawatan gz+inflate.
    gzip: false,
  }
}

/** Deteksi SIMD WASM tanpa dependensi tambahan (WebView lama belum punya). */
function hasWasmSimd(): boolean {
  try {
    // Modul minimal berisi instruksi SIMD (i8x16.splat).
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ]),
    )
  } catch {
    return false
  }
}

/** Otsu: threshold global optimal dari histogram, tahan cahaya tak rata. */
function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Uint32Array(256)
  const n = gray.length
  for (let i = 0; i < n; i++) hist[gray[i]]++

  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]

  let sumB = 0
  let wB = 0
  let bestVar = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const variance = wB * wF * (mB - mF) * (mB - mF)
    if (variance > bestVar) {
      bestVar = variance
      threshold = t
    }
  }
  return threshold
}

/** Median 3x3 pada kanal tunggal — membuang bintik JPEG/noise sensor. */
function median3(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length)
  const win = new Uint8Array(9)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let k = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx
          win[k++] = src[yy * w + xx]
        }
      }
      // insertion sort 9 elemen — lebih cepat dari sort() per piksel
      for (let i = 1; i < 9; i++) {
        const v = win[i]
        let j = i - 1
        while (j >= 0 && win[j] > v) {
          win[j + 1] = win[j]
          j--
        }
        win[j + 1] = v
      }
      out[y * w + x] = win[4]
    }
  }
  return out
}

/**
 * Siapkan gambar untuk Tesseract:
 * normalisasi lebar -> grayscale -> Otsu binarization -> median 3x3.
 */
async function preprocess(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(TARGET_WIDTH / bitmap.width, 1)
  let w = Math.max(1, Math.round(bitmap.width * scale))
  let h = Math.max(1, Math.round(bitmap.height * scale))

  // Jaga-jaga untuk foto panorama / kamera resolusi ekstrem.
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
  bitmap.close?.()

  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    gray[p] = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0
  }

  const thr = otsuThreshold(gray)
  const bin = new Uint8ClampedArray(gray.length)
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] > thr ? 255 : 0
  const clean = median3(bin, w, h)

  for (let i = 0, p = 0; i < clean.length; i++, p += 4) {
    px[p] = px[p + 1] = px[p + 2] = clean[i]
    px[p + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Preprocessing gagal'))),
      'image/png',
    )
  })
}

/** Skor kasar seberapa banyak field KTP yang berhasil dibaca dari teks. */
export function ocrFieldScore(text: string): number {
  const flat = text.replace(/\s+/g, ' ')
  let score = 0
  if (/\d{16}/.test(text.replace(/\D/g, ''))) score += 3 // NIK paling penting
  if (/nama/i.test(flat)) score += 1
  if (/lahir/i.test(flat)) score += 1
  if (/alamat/i.test(flat)) score += 1
  if (/rt\s*\/?\s*rw/i.test(flat)) score += 1
  if (/kel|desa/i.test(flat)) score += 1
  if (/kecamatan/i.test(flat)) score += 1
  if (/\d{2}[./-]\d{2}[./-]\d{4}/.test(flat)) score += 1
  // teks acak gelap biasanya pendek; beri sedikit bobot panjang
  score += Math.min(3, Math.floor(flat.trim().length / 60))
  return score
}

export interface OcrResult {
  text: string
  score: number
  /** true bila NIK 16 digit ditemukan — target utama scan KTP */
  hasNik: boolean
}

/**
 * Jalankan OCR pada foto KTP.
 * @param onProgress 0..1 untuk indikator "Memindai…"
 */
export async function scanKtp(
  file: File,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  onProgress?.(0.05)
  const prepped = await preprocess(file)
  onProgress?.(0.2)

  const coreFile = hasWasmSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'
  const paths = assetPaths(coreFile)

  let worker: Worker | null = null
  try {
    worker = await createWorker(['ind', 'eng'], 1, {
      ...paths,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onProgress?.(0.2 + m.progress * 0.75)
      },
    })

    let best: OcrResult = { text: '', score: -1, hasNik: false }

    // Dua mode segmentasi: SINGLE_BLOCK lebih baik pada foto redup/miring,
    // AUTO lebih baik pada foto bersih. Ambil skor tertinggi.
    for (const psm of [PSM.SINGLE_BLOCK, PSM.AUTO]) {
      await worker.setParameters({ tessedit_pageseg_mode: psm })
      const { data } = await worker.recognize(prepped)
      const text = data.text || ''
      const score = ocrFieldScore(text)
      const hasNik = /\d{16}/.test(text.replace(/\D/g, ''))
      if (score > best.score) best = { text, score, hasNik }
      // NIK sudah ketemu dan teksnya wajar: tidak perlu mode kedua.
      if (hasNik && score >= 6) break
    }

    onProgress?.(1)
    return best
  } finally {
    await worker?.terminate().catch(() => undefined)
  }
}
