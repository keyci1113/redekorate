// The detail modal the home page opens when a KPI card is clicked: the items behind that number, each a link.
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { fmtNum, plural, t } from "../../lib/i18n";
import { Modal, SeverityBadge, cx } from "../ui";
import type { Drill, DrillRow } from "./drill";

export function DrillModal({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  return (
    <Modal open={!!drill} onClose={onClose} title={drill?.title ?? ""} wide>
      {drill && <Rows drill={drill} />}
    </Modal>
  );
}

function End({ row }: { row: DrillRow }) {
  if (row.severity) return <SeverityBadge severity={row.severity} />;
  if (!row.end) return null;
  if (!row.tone) return <>{row.end}</>;
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap", row.tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>{row.end}</span>;
}

function Rows({ drill: { rows, empty, note, total } }: { drill: Drill }) {
  if (!rows.length) return <p className="py-4 text-[13px] text-ink-3">{empty}</p>;
  const count = total !== undefined && total > rows.length
    ? t("Mostrando {a} de {b}", { a: fmtNum(rows.length), b: fmtNum(total) })
    : plural(rows.length, { one: "{n} elemento", other: "{n} elementos" });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3">{count}{note ? ` · ${note}` : ""}</p>
      <ul className="-mx-2 flex max-h-[60vh] flex-col divide-y divide-line/60 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.to} className="focus-ring group flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-ink/[0.04]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold group-hover:underline">{r.title}</span>
                {r.sub && <span className="block truncate text-xs text-ink-3">{r.sub}</span>}
              </span>
              {(r.end || r.severity) && <span className="flex shrink-0 items-center gap-2 text-[13px] font-semibold tabular-nums"><End row={r} /></span>}
              <ArrowRight size={15} aria-hidden className="shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
