// Kamera native via Capacitor (Android/iOS). Di web (browser) fallback ke null,
// caller memicu input file biasa. Jadikan capturable = File yang sama seperti
// hasil input file, jadi seluruh pipeline (preview + OCR) tidak berubah.
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

export const isNative = Capacitor.isNativePlatform()

/** Buka kamera asli device, kembalikan File hasil jepretan; null bila gagal/dibatal. */
export async function capturePhoto(source: CameraSource = CameraSource.Camera): Promise<File | null> {
  if (!isNative) return null
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source,
    quality: 90,
    correctOrientation: true,
  })
  if (!photo.dataUrl) return null
  const res = await fetch(photo.dataUrl)
  const blob = await res.blob()
  const ext = blob.type.includes('png') ? 'png' : 'jpg'
  return new File([blob], `ktp-capture.${ext}`, { type: blob.type || `image/${ext}` })
}

/** Minta izin kamera (Android). Safe di web (no-op). */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!isNative) return true
  const perm = await Camera.requestPermissions()
  return perm.camera === 'granted' || perm.camera === 'limited'
}
