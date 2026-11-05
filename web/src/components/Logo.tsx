import { t } from "../lib/i18n";
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="rk-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#BF7DF5" />
          <stop offset="1" stopColor="#5902A1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#rk-g)" />
      {/* Tarjetas apiladas: research + organización */}
      <rect x="8" y="9" width="11" height="14" rx="2.5" fill="#fff" opacity=".45" transform="rotate(-10 13.5 16)" />
      <rect x="12" y="8" width="11" height="15" rx="2.5" fill="#fff" />
      <path d="M15 13h5M15 16.5h3.5" stroke="#5902A1" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">{t("redekorate")}</span>
    </span>
  );
}
