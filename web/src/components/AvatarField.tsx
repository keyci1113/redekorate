// The profile photo picker: upload, then drag and zoom the photo inside the circle; "Adjust" reopens it later.
import { createPortal } from "react-dom";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { ImagePlus, Loader2, Move } from "lucide-react";
import { Avatar } from "./Avatar";
import { Button, Modal } from "./ui";
import { CENTER, clampCrop, cropStyle, dragCrop, parseAvatar, withCrop, ZOOM_MAX, ZOOM_MIN, type Crop } from "../lib/avatarCrop";
import { optimizeImage } from "../lib/image";
import { api } from "../lib/api";
import { t } from "../lib/i18n";

const BOX = 240;

export function AvatarField({ name, avatar, onSave }: { name: string; avatar?: string | null; onSave: (url: string | null) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ src: string; crop: Crop } | null>(null);

  async function pick(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") { setErr(t("Usa PNG, JPG, GIF o WEBP")); return; }
    setBusy(true); setErr(null);
    try { setEditing({ src: await api.upload(await optimizeImage(file)), crop: CENTER }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function save(url: string | null) {
    setBusy(true); setErr(null);
    try { await onSave(url); setEditing(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}>
        {avatar
          ? <button type="button" onClick={() => setEditing(parseAvatar(avatar))} title={t("Ajustar foto")} className="focus-ring rounded-full"><Avatar name={name} avatar={avatar} size={72} /></button>
          : <Avatar name={name} avatar={null} size={72} />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" icon={busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t("Subiendo…") : avatar ? t("Cambiar foto") : t("Subir foto")}
          </Button>
          {avatar && <Button type="button" size="sm" icon={<Move size={14} />} onClick={() => setEditing(parseAvatar(avatar))}>{t("Ajustar")}</Button>}
          {avatar && <Button type="button" size="sm" variant="ghost" className="text-bad" disabled={busy} onClick={() => void save(null)}>{t("Quitar")}</Button>}
        </div>
      </div>
      {err && <p role="alert" className="mt-1 text-xs text-bad">{err}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      {/* A portal, so the dialog's buttons never submit the profile form around this field. */}
      {editing && createPortal(<CropDialog src={editing.src} initial={editing.crop} busy={busy} onClose={() => setEditing(null)} onSave={(c) => void save(withCrop(editing.src, c))} />, document.body)}
    </div>
  );
}

function CropDialog({ src, initial, busy, onClose, onSave }: { src: string; initial: Crop; busy: boolean; onClose: () => void; onSave: (c: Crop) => void }) {
  const [crop, setCrop] = useState<Crop>(initial);
  const size = useRef({ w: 1, h: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const move = (dx: number, dy: number) => setCrop((c) => dragCrop(c, dx, dy, BOX, size.current.w, size.current.h));
  const zoom = (z: number) => setCrop((c) => clampCrop({ ...c, z }));
  const onDown = (e: PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    move(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onWheel = (e: WheelEvent) => zoom(crop.z - e.deltaY * 0.002);
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 24 : 6;
    const d: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (d[e.key]) { e.preventDefault(); move(...d[e.key]); }
    if (e.key === "+" || e.key === "=") zoom(crop.z + 0.1);
    if (e.key === "-") zoom(crop.z - 0.1);
  };

  return (
    <Modal open onClose={onClose} title={t("Ajustar foto de perfil")}>
      <p className="text-sm text-ink-2">{t("Arrastra la foto para moverla y usa el control para acercarla. Lo que queda dentro del círculo es lo que verán los demás.")}</p>
      <div className="mt-4 flex justify-center">
        <div tabIndex={0} role="application" aria-label={t("Posición de la foto: arrastra o usa las flechas; + y − para acercar")}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onWheel={onWheel} onKeyDown={onKey}
          style={{ width: BOX, height: BOX }} className="focus-ring relative cursor-grab touch-none overflow-hidden rounded-xl bg-paper select-none active:cursor-grabbing">
          <img src={src} alt="" draggable={false} className="pointer-events-none h-full w-full" style={cropStyle(crop)}
            onLoad={(e) => { size.current = { w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 }; }} />
          {/* Darkens the corners: only the circle is shown as the profile photo. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_200px_rgba(0,0,0,0.5)] ring-2 ring-white/80" />
        </div>
      </div>
      <label className="mt-5 flex items-center gap-3 text-sm">
        <span className="shrink-0 text-ink-2">{t("Zoom")}</span>
        <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={crop.z} onChange={(e) => zoom(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
      </label>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setCrop(CENTER)}>{t("Centrar")}</Button>
        <div className="flex gap-2">
          <Button type="button" onClick={onClose}>{t("Cancelar")}</Button>
          <Button type="button" variant="primary" disabled={busy} onClick={() => onSave(crop)}>{t("Guardar")}</Button>
        </div>
      </div>
    </Modal>
  );
}
