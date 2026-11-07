// Ekspor berkas PDF/CSV yang bekerja di WEB dan di WebView native (Capacitor).
//
// Kenapa tidak cukup <a download> + window.print()?
//   * WebView Android tidak punya download manager dan tidak mengimplementasikan
//     dialog print -> `a.click()` dan `window.print()` sama-sama no-op, jadi
//     tombol laporan "tidak berfungsi" tanpa error apa pun.
//   * Jalur native: tulis byte ke Filesystem (Documents) lalu buka share sheet
//     Android supaya user bisa simpan ke Files / kirim ke WhatsApp-email.
//   * Jalur web tetap pakai blob + <a download> (paling ringan, tanpa dialog).
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export const isNativePlatform = Capacitor.isNativePlatform()

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
  /** Lokasi yang bisa ditunjukkan ke user, mis. "Documents/SWFinance" */
  location: string
}

/**
 * Simpan berkas lalu tawarkan ke user.
 * Native: tulis ke Documents/SWFinance/<name> + buka share sheet.
 * Web:    unduh lewat <a download>.
 */
export async function saveAndShare(
  name: string,
  data: Blob | ArrayBuffer,
  mime: string,
): Promise<SavedFile> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime })

  if (!isNativePlatform) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke ditunda: revoke langsung membatalkan unduhan di sebagian browser.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { name, location: 'folder Unduhan browser' }
  }

  const base64 = await blobToBase64(blob)
  // Folder sendiri supaya mudah dicari di Files, dan tidak tabrakan dengan app lain.
  const path = `SWFinance/${name}`
  const res = await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  })

  // Share sheet = satu-satunya cara menyimpan ke folder pilihan user di Android 11+.
  try {
    // Ambil file:// URI dari path internal plugin agar provider-nya cocok.
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents })
    await Share.share({
      title: name,
      text: `SWFinance — ${name}`,
      url: uri,
      files: [uri],
      dialogTitle: 'Simpan atau kirim laporan',
    })
  } catch {
    // User menutup share sheet atau share plugin tidak tersedia: berkas SUDAH
    // tersimpan di Documents/SWFinance, jadi ini bukan kegagalan ekspor.
  }

  return { name, uri: res.uri, location: 'Documents/SWFinance' }
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
