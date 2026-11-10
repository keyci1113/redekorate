import { cx } from "./ui";

/** An organization's logo, or its initial on the organization color when it has none. Square with soft corners, unlike the round Avatar. */
export function OrgLogo({ name, logo, color, size = 36, className }: { name: string; logo?: string | null; color?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  const radius = size >= 48 ? "rounded-xl" : "rounded-lg";
  if (logo) return <img src={logo} alt="" style={style} className={cx("shrink-0 bg-white object-contain p-0.5 ring-1 ring-black/10", radius, className)} />;
  return (
    <span style={{ ...style, background: color ?? "#5902A1" }} aria-hidden className={cx("flex shrink-0 items-center justify-center font-semibold text-white", radius, className)}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
