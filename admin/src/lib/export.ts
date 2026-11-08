// Ekspor berkas PDF/CSV yang bekerja di WEB, WebView native (Capacitor), dan
// desktop Electron — dengan HASIL YANG SAMA di ketiganya.
//
// Kenapa tidak cukup <a download> + window.print()?
//   * WebView Android tidak punya download manager dan tidak mengimplementasikan
//     dialog print -> a.click() dan window.print() sama-sama no-op.
//   * Electron memuat app lewat file:// tanpa handler will-download, jadi
//     <a download>/blob: juga tidak menghasilkan berkas.
//
// Satu fungsi `saveFiles()` untuk semua platform supaya isi, nama, dan jumlah
// berkas identik di desktop maupun HP.
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export const isNativePlatform = Capacitor.isNativePlatform()

/** Jembatan desktop (preload.cjs). Ada hanya di aplikasi Electron. */
interface SwfBridge {
  isDesktop?: boolean
  saveFiles?: (files: { name: string; base64: string }[]) => Promise<{ folder: string; count: number }>
}
declare global {
  interface Window {
    swf?: SwfBridge
  }
}

export const isDesktopApp =
  typeof window !== 'undefined' && Boolean(window.swf?.isDesktop && window.swf?.saveFiles)

/** ArrayBuffer -> base64 (dipakai Filesystem.writeFile tanpa encoding) */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(new Error('Gagal membaca berkas'))
    r.readAsDataURL(blob)
  })
}

export interface SavedFile {
  /** Nama berkas tanpa folder */
  name: string
  /** URI file:// hasil tulis di perangkat (native) */
  uri?: string
  /** Lokasi yang bisa ditunjukkan ke user */
  location: string
}

/** Satu berkas yang akan disimpan/dibagikan. */
export interface OutFile {
  name: string
  data: Blob | ArrayBuffer
  mime: string
}

const toBlob = (f: OutFile) => (f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.mime }))

/**
 * Tulis satu berkas di Android.
 *
 * Kenapa berlapis: `Directory.Documents` di Capacitor memakai
 * `Environment.getExternalStoragePublicDirectory(DOCUMENTS)` — jalur legacy yang
 * TIDAK bisa ditulis di Android 11+ tanpa izin "All files access"
 * (MANAGE_EXTERNAL_STORAGE). Akibatnya ekspor gagal:
 *   EACCES ... /storage/emulated/0/Documents/SWFinance/laporan.pdf
 *
 * Urutan percobaan:
 *   1. ExternalStorage -> Download/SWFinance  (terlihat di app Files)
 *   2. Cache          -> SWFinance           (pasti bisa, tanpa izin)
 * Berkas yang sama tetap bisa dibagikan dari kedua lokasi (provider file_paths
 * mendeklarasikan <external-path> dan <cache-path>).
 */
async function writeOneNative(name: string, base64: string): Promise<{ uri: string; location: string }> {
  const attempts: { dir: Directory; path: string; location: string }[] = [
    { dir: Directory.ExternalStorage, path: `Download/SWFinance/${name}`, location: 'Download/SWFinance' },
    { dir: Directory.Cache, path: `SWFinance/${name}`, location: 'cache aplikasi (dibagikan)' },
  ]
  let lastErr: unknown = null
  for (const a of attempts) {
    try {
      await Filesystem.writeFile({ path: a.path, data: base64, directory: a.dir, recursive: true })
      const { uri } = await Filesystem.getUri({ path: a.path, directory: a.dir })
      return { uri, location: a.location }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Gagal menulis berkas laporan')
}

/**
 * Simpan sekumpulan berkas sekaligus dan tawarkan ke user.
 * Semua platform menulis berkas yang SAMA (nama + isi identik).
 */
export async function saveFiles(files: OutFile[]): Promise<SavedFile[]> {
  if (files.length === 0) return []

  // ---- Desktop Electron: tulis ke satu folder lewat proses utama ----
  if (isDesktopApp && window.swf?.saveFiles) {
    const payload = await Promise.all(
      files.map(async (f) => ({ name: f.name, base64: await blobToBase64(toBlob(f)) })),
    )
    const res = await window.swf.saveFiles(payload)
    return files.map((f) => ({ name: f.name, location: res.folder }))
  }

  // ---- Web browser: unduh tiap berkas ----
  if (!isNativePlatform) {
    const out: SavedFile[] = []
    for (const f of files) {
      const url = URL.createObjectURL(toBlob(f))
      const a = document.createElement('a')
      a.href = url
      a.download = f.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoke ditunda: revoke langsung membatalkan unduhan di sebagian browser.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      out.push({ name: f.name, location: 'folder Unduhan browser' })
      // Jeda kecil supaya browser tidak memblokir unduhan beruntun.
      if (files.length > 1) await new Promise((r) => setTimeout(r, 250))
    }
    return out
  }

  // ---- APK (Capacitor): tulis SEMUA dulu, lalu SATU share sheet ----
  const out: SavedFile[] = []
  const uris: string[] = []
  for (const f of files) {
    const base64 = await blobToBase64(toBlob(f))
    const w = await writeOneNative(f.name, base64)
    out.push({ name: f.name, uri: w.uri, location: w.location })
    uris.push(w.uri)
  }
  try {
    // Share sheet = satu-satunya cara menyimpan ke folder pilihan user di Android 11+.
    await Share.share({
      title: files.length === 1 ? files[0].name : `SWFinance — ${files.length} berkas laporan`,
      text: 'SWFinance — laporan',
      files: uris,
      dialogTitle: 'Simpan atau kirim laporan',
    })
  } catch {
    // User menutup share sheet / plugin tidak tersedia: berkas SUDAH ditulis,
    // jadi ini bukan kegagalan ekspor.
  }
  return out
}

/** Simpan satu berkas (pembungkus saveFiles). */
export async function saveAndShare(
  name: string,
  data: Blob | ArrayBuffer,
  mime: string,
): Promise<SavedFile> {
  const [first] = await saveFiles([{ name, data, mime }])
  return first
}

/** CSV sebagai teks -> simpan/unduh dengan BOM UTF-8 (Excel Windows aman) */
export async function saveCsv(name: string, csv: string): Promise<SavedFile> {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  return saveAndShare(name, blob, 'text/csv;charset=utf-8;')
}

/** Bangun teks CSV dari array-of-arrays, kutip bila perlu */
export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((sel) => {
          const s = String(sel ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\r\n')
}

export { bufferToBase64, Encoding }
