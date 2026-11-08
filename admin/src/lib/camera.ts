// Kamera native via Capacitor (Android/iOS). Di web (browser) fallback ke null,
// caller memicu input file biasa. Jadikan capturable = File yang sama seperti
// hasil input file, jadi seluruh pipeline (preview + OCR) tidak berubah.
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export const isNative = Capacitor.isNativePlatform()

/** Sumber foto: kamera langsung atau galeri. */
export type PhotoSource = 'camera' | 'gallery'

/**
 * Buka kamera asli atau galeri device, kembalikan File hasilnya; null bila
 * gagal atau dibatalkan user.
 */
export async function pickPhoto(source: PhotoSource = 'camera'): Promise<File | null> {
  if (!isNative) return null
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    quality: 95,
    correctOrientation: true,
    // Tanpa editing: WebView tidak punya cropper, dan allowEditing memaksa UI
    // native yang tidak konsisten antar merk HP.
    allowEditing: false,
  })
  if (!photo.dataUrl) return null
  const res = await fetch(photo.dataUrl)
  const blob = await res.blob()
  const ext = blob.type.includes('png') ? 'png' : 'jpg'
  return new File([blob], `ktp-${source}.${ext}`, { type: blob.type || `image/${ext}` })
}

/** Alias lama — dipakai kode yang hanya butuh kamera. */
export function capturePhoto(): Promise<File | null> {
  return pickPhoto('camera')
}

/** Minta izin kamera (Android). Safe di web (no-op). */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!isNative) return true
  const perm = await Camera.requestPermissions()
  return perm.camera === 'granted' || perm.camera === 'limited'
}

/** Minta izin baca galeri (Android 13+ memakai READ_MEDIA_IMAGES). */
export async function ensurePhotosPermission(): Promise<boolean> {
  if (!isNative) return true
  const perm = await Camera.requestPermissions({ permissions: ['photos'] })
  return perm.photos === 'granted' || perm.photos === 'limited'
}
