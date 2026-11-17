import { cx } from "./ui";
import { cropStyle, parseAvatar } from "../lib/avatarCrop";

/** Foto de perfil (con la posición que eligió la persona), o la inicial sobre el degradado de marca cuando no hay foto. */
export function Avatar({ name, avatar, size = 36, className }: { name: string; avatar?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (avatar) {
    const { src, crop } = parseAvatar(avatar);
    return (
      <span style={style} className={cx("relative block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10", className)}>
        <img src={src} alt="" draggable={false} className="h-full w-full" style={cropStyle(crop)} />
      </span>
    );
  }
  return (
    <span style={style} aria-hidden className={cx("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#BF7DF5] to-[#5902A1] font-semibold text-white", className)}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
