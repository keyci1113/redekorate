import { cx } from "./ui";

/** Foto de perfil, o la inicial sobre el degradado de marca cuando no hay foto. */
export function Avatar({ name, avatar, size = 36, className }: { name: string; avatar?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (avatar) return <img src={avatar} alt="" style={style} className={cx("shrink-0 rounded-full object-cover ring-1 ring-black/10", className)} />;
  return (
    <span style={style} aria-hidden className={cx("flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#BF7DF5] to-[#5902A1] font-semibold text-white", className)}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
