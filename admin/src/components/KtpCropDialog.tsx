// Dialog crop KTP: user mengatur kotak area kartu, sisanya dibuang sebelum OCR.
//
// Kenapa ini ada: operator meminta bisa membatasi area yang dipindai, karena
// foto KTP sering memuat latar (kaki, ubin, meja) yang mengganggu. Dengan kotak
// manual, OCR hanya menerima area kartu sehingga hasil lebih stabil dan cepat.
//
// Kotak dikunci ke rasio KTP (85,6 x 53,98 mm = 1,586) supaya hasil crop selalu
// berbentuk kartu, bukan persegi acak. Bisa digeser (drag di dalam kotak) dan
// diubah ukurannya (tarik sudut kanan-bawah); rasio tetap.
import { useCallback, useEffect, useRef, useState } from 'react'

/** Rasio KTP (lebar / tinggi). */
const KTP_RATIO = 85.6 / 53.98

interface Props {
  /** Sumber gambar (data URL hasil pilih kamera/galeri). */
  src: string
  /** Kotak awal (koordinat relatif 0..1) dari deteksi kartu, bila ada. */
  suggested?: { x: number; y: number; w: number; h: number } | null
  /** Teks tombol konfirmasi. */
  confirmText?: string
  onCancel: () => void
  /** Terima hasil crop sebagai Blob JPEG. */
  onConfirm: (blob: Blob) => void
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

type DragMode = 'move' | 'resize' | null

export default function KtpCropDialog({ src, suggested, confirmText = 'Pakai area ini', onCancel, onConfirm }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; box: Box }>({
    mode: null,
    startX: 0,
    startY: 0,
    box: { x: 0, y: 0, w: 0, h: 0 },
  })

  // Inisialisasi kotak. Kalau deteksi kartu memberi saran (koordinat relatif),
  // pakai itu; kalau tidak, jatuh ke kotak center 84% lebar dengan rasio KTP.
  const initBox = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const iw = img.clientWidth
    const ih = img.clientHeight
    if (!iw || !ih) return
    if (suggested && suggested.w > 0 && suggested.h > 0) {
      return setBox({
        x: suggested.x * iw,
        y: suggested.y * ih,
        w: suggested.w * iw,
        h: suggested.h * ih,
      })
    }
    let w = iw * 0.84
    let h = w / KTP_RATIO
    if (h > ih * 0.84) {
      h = ih * 0.84
      w = h * KTP_RATIO
    }
    setBox({ x: (iw - w) / 2, y: (ih - h) / 2, w, h })
  }, [suggested])

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    if (img.complete) initBox()
  }, [initBox, src])

  // Saran deteksi sering tiba SETELAH gambar selesai dimuat (deteksi berjalan
  // paralel). Saat saran masuk, pindahkan kotak ke posisi kartu.
  useEffect(() => {
    const img = imgRef.current
    if (!img || !img.complete || !suggested) return
    initBox()
  }, [suggested, initBox])

  const clamp = (b: Box): Box => {
    const img = imgRef.current
    if (!img) return b
    const iw = img.clientWidth
    const ih = img.clientHeight
    const w = Math.max(40, Math.min(b.w, iw))
    const h = Math.max(40 / KTP_RATIO, Math.min(b.h, ih))
    return {
      w,
      h,
      x: Math.max(0, Math.min(b.x, iw - w)),
      y: Math.max(0, Math.min(b.y, ih - h)),
    }
  }

  const onPointerDown = (e: React.PointerEvent, mode: DragMode) => {
    if (!box) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = { mode, startX: e.clientX, startY: e.clientY, box: { ...box } }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.mode) return
    e.preventDefault()
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'move') {
      setBox(clamp({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }))
    } else {
      // Resize dari sudut kanan-bawah, rasio tetap.
      const nw = Math.max(40, d.box.w + dx)
      const nh = nw / KTP_RATIO
      setBox(clamp({ x: d.box.x, y: d.box.y, w: nw, h: nh }))
    }
  }

  const endDrag = () => {
    drag.current.mode = null
  }

  // Crop sesuai kotak, dalam resolusi asli gambar.
  const doCrop = async () => {
    const img = imgRef.current
    if (!img || !box) return
    setBusy(true)
    try {
      const scaleX = img.naturalWidth / img.clientWidth
      const scaleY = img.naturalHeight / img.clientHeight
      const sx = Math.round(box.x * scaleX)
      const sy = Math.round(box.y * scaleY)
      const sw = Math.round(box.w * scaleX)
      const sh = Math.round(box.h * scaleY)

      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas tidak tersedia')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Gagal membuat gambar')
      onConfirm(blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <div className="mb-2 text-center text-sm font-medium text-white">
          Atur kotak tepat di area kartu KTP — bagian luar kotak tidak akan dipindai.
        </div>

        <div className="relative mx-auto w-full flex-1 overflow-hidden rounded-xl bg-black">
          {/* w-fit: bingkai posisi harus PERSIS selebar gambar. Kalau w-full,
              pada foto portrait (img dibatasi max-h) gambar lebih sempit dari
              bingkai sehingga kotak crop bergeser relatif ke bingkai. */}
          <div className="relative mx-auto w-fit max-w-full" style={{ lineHeight: 0 }}>
            <img
              ref={imgRef}
              src={src}
              alt="Foto KTP"
              className="mx-auto block max-h-[62vh] w-auto max-w-full select-none"
              draggable={false}
              onLoad={initBox}
            />
            {box && (
              <div
                className="absolute inset-0"
                style={{ pointerEvents: 'none' }}
              >
                {/* Area gelap di luar kotak (4 persegi) supaya terlihat jelas. */}
                <div
                  className="absolute bg-black/55"
                  style={{ left: 0, top: 0, right: 0, height: box.y }}
                />
                <div
                  className="absolute bg-black/55"
                  style={{ left: 0, bottom: 0, right: 0, height: `calc(100% - ${box.y + box.h}px)` }}
                />
                <div
                  className="absolute bg-black/55"
                  style={{ left: 0, top: box.y, width: box.x, height: box.h }}
                />
                <div
                  className="absolute bg-black/55"
                  style={{ right: 0, top: box.y, left: box.x + box.w, height: box.h }}
                />
                {/* Kotak crop + pegangan geser/resize. */}
                <div
                  className="absolute cursor-move border-2 border-emerald-400"
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: 'auto', touchAction: 'none' }}
                  onPointerDown={(e) => onPointerDown(e, 'move')}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <div className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-sm border-2 border-white bg-emerald-500"
                    style={{ touchAction: 'none' }}
                    onPointerDown={(e) => onPointerDown(e, 'resize')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-xl border border-white/40 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void doCrop()}
            disabled={busy || !box}
            className="min-h-11 rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? 'Memproses…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
