import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import type { Block } from "../blocks/types";
import { blockDef } from "../blocks/registry";
import { BlockView, isAnswered, isWide } from "../blocks/Runner";
import { nextIndex } from "../blocks/logic";
import { Button, ErrorNote, Spinner, cx } from "../components/ui";
import { LogoMark, Wordmark } from "../components/Logo";
import { brandStyle, type StudySettings } from "../lib/settings";
import { getLang, useLang } from "../lib/i18n";

import { t } from "../lib/i18n";
interface PublicStudy { id?: string; title: string; status: string; blocks?: Block[]; settings?: StudySettings }

export function RunnerPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<{ study: PublicStudy; available: boolean; preview?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setLang } = useLang();
  // Los participantes ven la interfaz en el idioma del estudio (sin guardar la preferencia).
  useEffect(() => {
    const l = state?.study.settings?.language;
    if (l && l !== getLang()) setLang(l, false);
  }, [state, setLang]);

  useEffect(() => {
    api.get<{ study: PublicStudy; available: boolean; preview?: boolean }>(`/public/studies/${slug}${params.get("preview") ? "?preview=1" : ""}`)
      .then(setState).catch((e) => setError(e.message));
  }, [slug, params]);

  if (error) return <Center><ErrorNote>{error}</ErrorNote></Center>;
  if (!state) return <Spinner />;
  if (!state.available) {
    return (
      <Center>
        <div className="text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-ink-3 ring-1 ring-line"><Lock size={20} /></span>
          <h1 className="display text-3xl">{state.study.status === "closed" ? t("Este estudio ya cerró") : t("Este estudio aún no está disponible")}</h1>
          <p className="mt-2 text-sm text-ink-3">{t("Gracias por tu interés. Si crees que es un error, contacta a quien te envió el link.")}</p>
        </div>
      </Center>
    );
  }
  return <Run slug={slug!} blocks={state.study.blocks ?? []} settings={state.study.settings ?? {}} preview={!!state.preview} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full items-center justify-center p-6">{children}</div>;
}

function Run({ slug, blocks, settings, preview }: { slug: string; blocks: Block[]; settings: StudySettings; preview: boolean }) {
  const [i, setI] = useState(0);
  const [history, setHistory] = useState<number[]>([]);       // para "Atrás" respetando la lógica
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [consented, setConsented] = useState(!settings.consent?.enabled);
  const [agree, setAgree] = useState(false);
  const session = useRef<string | null>(null);
  const shownAt = useRef(Date.now());
  const block = blocks[i];
  const showProgress = settings.showProgress !== false;
  const allowBack = settings.allowBack !== false;
  const finalIdx = blocks[blocks.length - 1]?.type === "thank_you" ? blocks.length - 1 : -1;

  useEffect(() => { shownAt.current = Date.now(); window.scrollTo({ top: 0 }); }, [i]);

  const canNext = !block || !block.required || isAnswered(block, values[block.id]);

  async function ensureSession() {
    if (preview || session.current) return session.current;
    const qs = Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([k]) => k !== "preview").slice(0, 10).map(([k, v]) => [k.slice(0, 40), v.slice(0, 120)]));
    if (settings.consent?.enabled) qs.consent = "aceptado";
    const { session_id } = await api.post<{ session_id: string }>(`/public/studies/${slug}/sessions`, { participant: qs });
    session.current = session_id;
    return session_id;
  }

  async function finish(sid: string | null) {
    if (sid) await api.post(`/public/sessions/${sid}/complete`);
    if (finalIdx >= 0 && i !== finalIdx) { setHistory((h) => [...h, i]); setI(finalIdx); } else setFinished(true);
  }

  async function next(override?: unknown) {
    if (!block || busy) return;
    const value = override !== undefined ? override : values[block.id];
    if (block.required && !isAnswered(block, value)) return;
    setBusy(true); setErr(null);
    try {
      const sid = await ensureSession();
      if (sid && blockDef(block.type)?.collectsAnswer && value !== undefined && isAnswered(block, value)) {
        await api.put(`/public/sessions/${sid}/answers/${block.id}`, { value, duration_ms: Date.now() - shownAt.current });
      }
      let j = nextIndex(blocks, i, value);
      if (j === finalIdx) j = -1;            // la pantalla final se muestra al completar
      if (j < 0) await finish(sid);
      else { setHistory((h) => [...h, i]); setI(j); }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const back = () => { const h = [...history]; const prev = h.pop(); if (prev !== undefined) { setHistory(h); setI(prev); } };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing || !consented) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement || (e.target instanceof HTMLInputElement && block?.type === "card_sort")) return;
      e.preventDefault(); next();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const atEnd = finished || block?.type === "thank_you";
  const progress = atEnd ? 1 : blocks.length > 1 ? i / (blocks.length - 1) : 0;
  const autoAdvance = block?.type === "five_second" || block?.type === "first_click" || block?.type === "prototype_task" || block?.type === "timed_task";

  return (
    <div className="flex min-h-full flex-col" style={brandStyle(settings) as CSSProperties}>
      {preview && <div className="bg-ink py-1.5 text-center text-xs text-paper">{t("Vista previa · las respuestas no se guardan")}</div>}
      {showProgress && <div className="h-1 bg-line"><div className="h-1 bg-accent transition-all duration-500" style={{ width: `${progress * 100}%` }} /></div>}
      {settings.brand?.logo && <div className="flex justify-center pt-6"><img src={settings.brand.logo} alt="" className="h-9 object-contain" /></div>}

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        {!consented ? (
          <div className="w-full max-w-xl animate-[fadeUp_.35s_ease-out]">
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent"><ShieldCheck size={22} /></span>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Consentimiento informado")}</h1>
            <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{settings.consent?.text}</p>
            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="text-[15px]">{t("He leído la información y acepto participar de forma voluntaria.")}</span>
            </label>
            <div className="mt-6 flex justify-end"><Button variant="primary" size="lg" className="!bg-accent" disabled={!agree} onClick={() => setConsented(true)}>{t("Continuar")} <ArrowRight size={16} /></Button></div>
          </div>
        ) : (
          <div key={i} className={cx("w-full animate-[fadeUp_.35s_ease-out]", block && isWide(block) ? "max-w-4xl" : "max-w-xl")}>
            {finished ? (
              <div className="text-center"><h1 className="display text-5xl">{t("¡Gracias!")}</h1><p className="mt-4 text-ink-2">{t("Tus respuestas fueron enviadas.")}</p></div>
            ) : block ? (
              <>
                <BlockView block={block} value={values[block.id]} preview={preview} settings={settings}
                  onChange={(v) => setValues((s) => ({ ...s, [block.id]: v }))} onAdvance={(v) => next(v)} />
                {err && <div className="mt-4"><ErrorNote>{err}</ErrorNote></div>}
                {block.type !== "thank_you" && !(autoAdvance && !preview) && (
                  <div className={cx("mt-9 flex items-center gap-3", block.type === "welcome" ? "justify-center" : "justify-between")}>
                    {block.type !== "welcome" && (
                      <button onClick={back} disabled={!history.length || !allowBack} className="focus-ring flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-3 hover:text-ink disabled:invisible">
                        <ArrowLeft size={15} /> {t("Atrás")}
                      </button>
                    )}
                    <div className="flex items-center gap-3">
                      {block.type !== "welcome" && !block.required && !isAnswered(block, values[block.id]) && <span className="text-xs text-ink-3">{t("Opcional")}</span>}
                      <Button variant="primary" size="lg" className="!bg-accent hover:!opacity-90" onClick={() => next()} disabled={!canNext || busy}>
                        {block.type === "welcome" ? block.buttonLabel : t("Siguiente")} {block.type !== "welcome" && <ArrowRight size={16} />}
                      </Button>
                    </div>
                  </div>
                )}
                {preview && autoAdvance && <div className="mt-6 flex justify-end"><Button onClick={() => next()} disabled={!canNext}>{t("Continuar (vista previa)")}</Button></div>}
              </>
            ) : <p className="text-center text-ink-3">{t("Este estudio no tiene contenido.")}</p>}
          </div>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5"><Lock size={11} /> {t("Datos protegidos · solo el equipo de investigación ve tus respuestas")}</span>
        {!settings.hideCredit && <span className="flex shrink-0 items-center gap-1.5">{t("Hecho con")} <LogoMark size={13} /><Wordmark height={10} /></span>}
      </footer>
    </div>
  );
}
