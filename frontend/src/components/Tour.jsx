import { useState, useEffect, useLayoutEffect, useCallback } from "react";

// A lightweight, dependency-free guided tour for the search screen. Anchored steps get a
// spotlight + a card near the target; intro/summary steps are centered. Keyboard: Esc to
// close, ←/→ to navigate. The parent persists "seen" so it only auto-runs once.
const STEPS = [
  {
    title: "Counterparty due diligence",
    body: "Pull up any company to see who really owns it and whether it's risky to work with — its ownership graph, beneficial owners, and recent adverse media. All from free, open data.",
    target: null,
  },
  {
    title: "Search a company",
    body: "Type a company name or an LEI. You'll get candidate matches resolved across several registries — pick one to build its dossier.",
    target: '[data-tour="search"]',
  },
  {
    title: "What's in a dossier",
    body: "An ownership graph (corporate parents + real beneficial owners, with undisclosed gaps shown), an adverse-media scan, plus US litigation and financial-distress signals where available.",
    target: null,
  },
  {
    title: "Sources, not verdicts",
    body: "Every fact carries its source. Flags are leads to verify — never accusations — and missing data is shown honestly instead of as an all-clear.",
    target: null,
  },
];

const PAD = 6;

export default function Tour({ open, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = STEPS[i];

  const measure = useCallback(() => {
    const sel = STEPS[i]?.target;
    if (!sel) return setRect(null);
    const el = document.querySelector(sel);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [i]);

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, i, measure]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  const close = useCallback(() => onClose(), [onClose]);
  const next = useCallback(() => setI((v) => (v < STEPS.length - 1 ? v + 1 : (close(), v))), [close]);
  const back = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next, back]);

  if (!open) return null;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Product tour">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay)" }} />
      )}

      <div className="tour-card" style={cardStyle(rect)}>
        <span className="tour-step-count">Step {i + 1} of {STEPS.length}</span>
        <div className="tour-title">{step.title}</div>
        <p className="tour-body">{step.body}</p>
        <div className="tour-actions">
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((_, k) => (
              <span key={k} className={`tour-dot ${k === i ? "tour-dot-active" : ""}`} />
            ))}
          </div>
          <div className="tour-nav">
            {i > 0 && (
              <button className="btn btn-back" type="button" onClick={back} style={{ margin: 0 }}>
                Back
              </button>
            )}
            <button className="btn btn-primary" type="button" onClick={next}>
              {i === STEPS.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </div>
        <button className="tour-skip" type="button" onClick={close}>
          Skip tour
        </button>
      </div>
    </div>
  );
}

// Place the card under the spotlight (or above if no room); centered when there's no target.
function cardStyle(rect) {
  if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  const cardW = Math.min(340, window.innerWidth - 32);
  const gap = 12;
  const estH = 230;
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - cardW - 16);
  const below = rect.top + rect.height + gap;
  const top = below + estH < window.innerHeight ? below : Math.max(16, rect.top - gap - estH);
  return { top, left, width: cardW };
}
