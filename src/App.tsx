import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DiceTable, type SettledDie, type TableSettings } from './engine/DiceTable';
import {
  adjustCount,
  cocPlan,
  evaluate,
  formulaPlan,
  formulaText,
  parseFormula,
  setModifier,
  MAX_PHYSICAL,
  type FormulaError,
  type Plan,
  type Sides,
  type Term,
} from './logic/roll';
import { DEFAULT_SETTINGS, loadSaved, save, SETTINGS_VERSION, type CocState, type HistoryEntry } from './state';
import { Coffer } from './ui/Coffer';
import { Ledger } from './ui/Ledger';
import { ConfirmModal, HelpModal, SettingsModal } from './ui/Modals';
import { Dock, Loader, Verdict, type Phase, type ShownResult } from './ui/Stage';
import { Toasts, type Toast } from './ui/controls';
import { IconAstrolabe, IconCodex, IconLedger, IconReroll, IconSound, Sigil } from './ui/Icons';
import { useI18n } from './i18n';

const DEFAULT_TERMS: Term[] = [{ type: 'dice', sign: 1, count: 1, sides: 20 }];

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  // engine callbacks are created once; they read the current language through this
  const tRef = useRef(t);
  tRef.current = t;
  const saved = loadSaved();
  const [settings, setSettings] = useState<TableSettings>(() => {
    const s = { ...DEFAULT_SETTINGS, ...saved.settings };
    // v2 made 0.35× the default speed; carry older saves over to it
    if ((saved.v ?? 1) < 2) s.timeScale = DEFAULT_SETTINGS.timeScale;
    // phones and tablets start on medium quality to spare the battery
    if (!saved.settings?.quality && window.matchMedia('(pointer: coarse)').matches) s.quality = 'medium';
    return s;
  });
  const [terms, setTerms] = useState<Term[]>(saved.terms?.length ? saved.terms : DEFAULT_TERMS);
  const [draft, setDraft] = useState(() => formulaText(saved.terms?.length ? saved.terms : DEFAULT_TERMS));
  const [draftError, setDraftError] = useState<FormulaError | null>(null);
  const [mode, setMode] = useState<'formula' | 'coc'>(saved.mode ?? 'formula');
  const [coc, setCoc] = useState<CocState>(saved.coc ?? { skill: 50, name: '', bonus: 0, penalty: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>(saved.history ?? []);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ShownResult | null>(null);
  const [modal, setModal] = useState<null | 'settings' | 'help' | 'burn'>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<{ code: 'noWebgl' } | { code: 'init'; msg: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [hasDice, setHasDice] = useState(false);
  const [viewManual, setViewManual] = useState(false);
  // desktop: panels left and right · sheet: portrait phones/tablets, controls in a bottom sheet ·
  // side: landscape phones, controls in a left column
  const narrow = useMedia('(max-width: 900px)');
  const short = useMedia('(max-height: 520px) and (orientation: landscape)');
  const coarse = useMedia('(pointer: coarse)');
  const layout: 'desktop' | 'sheet' | 'side' = short ? 'side' : narrow ? 'sheet' : 'desktop';
  const compact = layout !== 'desktop';

  const stage = useRef<HTMLDivElement>(null);
  const tagLayer = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const coffer = useRef<HTMLElement>(null);
  const ledger = useRef<HTMLElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const engine = useRef<DiceTable | null>(null);
  const pending = useRef<Plan | null>(null);
  const plans = useRef(new Map<number, Plan>());
  const toastId = useRef(0);

  // live mirror of state for engine callbacks
  const live = useRef({ mode, terms, coc, draftError, phase });
  live.current = { mode, terms, coc, draftError, phase };

  /* persistence */
  useEffect(() => save({ settings, v: SETTINGS_VERSION }), [settings]);
  useEffect(() => save({ terms, mode, coc }), [terms, mode, coc]);
  useEffect(() => save({ history: history.slice(0, 120) }), [history]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const buildPlan = useCallback((): Plan | null => {
    const s = live.current;
    if (s.mode === 'coc') return cocPlan(s.coc.skill, s.coc.name.trim(), s.coc.bonus, s.coc.penalty);
    if (s.draftError) {
      const tt = tRef.current;
      toast(tt.toast.badFormula(tt.formulaError(s.draftError)), 'warn');
      return null;
    }
    if (!s.terms.some((t) => t.type === 'dice')) return null;
    return formulaPlan(s.terms);
  }, [toast]);

  const onSettled = useCallback((id: number, dice: SettledDie[], info: { nudged: number; seconds: number }) => {
    const plan = plans.current.get(id);
    plans.current.delete(id);
    if (import.meta.env.DEV) console.log(`[roll] settled in ${info.seconds.toFixed(2)}s of simulated time, ${info.nudged} nudge(s)`);
    if (!plan) return;
    const outcome = evaluate(plan, dice);
    engine.current?.showTags(id, outcome.tags);
    setResult({ id, plan, outcome, nudged: info.nudged, seconds: info.seconds });
    setPhase('settled');
    if (outcome.badge?.tone === 'gold') engine.current?.uiSound('chime');
    const entry: HistoryEntry = {
      id: Date.now() + Math.random(),
      at: Date.now(),
      mode: plan.mode,
      formula: plan.mode === 'formula' ? plan.text : undefined,
      coc: plan.mode === 'coc' ? { skill: plan.skill, name: plan.name, bonus: plan.bonus, penalty: plan.penalty } : undefined,
      title: plan.text,
      total: outcome.total,
      parts: outcome.parts,
      badge: outcome.badge,
    };
    setHistory((h) => [entry, ...h].slice(0, 120));
  }, []);

  /* engine bootstrap */
  useEffect(() => {
    let alive = true;
    let table: DiceTable | null = null;
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) {
      setError({ code: 'noWebgl' });
      return;
    }
    DiceTable.create(
      stage.current!,
      tagLayer.current!,
      {
        requestDice: () => {
          const plan = buildPlan();
          if (!plan) return null;
          pending.current = plan;
          return plan.phys.map((p) => ({ kind: p.kind }));
        },
        onRollStart: (id) => {
          if (pending.current) plans.current.set(id, pending.current);
          pending.current = null;
          setPhase('rolling');
          setHasDice(true);
        },
        onSettled,
        onHoldChange: (h) => {
          if (h) {
            setPhase('holding');
            setHasDice(true);
          } else setPhase((p) => (p === 'holding' ? 'idle' : p));
        },
        onNotice: (m) => toast(m === 'empty' ? tRef.current.toast.empty : m),
        onViewChange: setViewManual,
      },
      settings,
    )
      .then((t) => {
        if (!alive) {
          t.dispose();
          return;
        }
        table = t;
        engine.current = t;
        setReady(true);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError({ code: 'init', msg: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
      table?.dispose();
      engine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.current?.setSettings(settings);
  }, [settings, ready]);

  useEffect(() => {
    engine.current?.setDimmed(modal !== null);
  }, [modal, ready]);

  /* layout → camera framing */
  const measure = useCallback(() => {
    const t = engine.current;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const hb = header.current?.getBoundingClientRect().bottom ?? 0;
    const d = dock.current?.getBoundingClientRect();
    let insets;
    if (layout === 'sheet') {
      // header · table · result strip · buttons · sheet, top to bottom; the table keeps clear of the strip
      const band = 62;
      const bottom = H - ((d?.top ?? H) - band);
      // on a phone held upright, the tray stands lengthwise to use the tall screen
      insets = { left: 0, right: 0, top: hb + 2, bottom, focusTop: hb + 2, focusBottom: bottom, portrait: W < 600 };
    } else if (layout === 'side') {
      // controls on the left, result strip above the table, buttons below it
      const l = coffer.current?.getBoundingClientRect().right ?? 0;
      const band = 62;
      const bottom = d ? H - d.top + 2 : 0;
      insets = { left: l, right: 0, top: hb + band, bottom, focusTop: hb + band, focusBottom: bottom };
    } else {
      const l = coffer.current?.getBoundingClientRect().right ?? 0;
      const r = ledger.current?.getBoundingClientRect().left ?? W;
      // the verdict banner lives above the tray; keep the tray clear of it when there is room
      const reserve = H >= 700 ? 118 : 0;
      const dockH = d ? H - d.top : 0;
      insets = { left: l, right: W - r, top: hb + reserve, bottom: dockH * 0.62, focusTop: hb + 118, focusBottom: dockH + 6 };
    }
    const root = document.documentElement;
    root.style.setProperty('--free-left', `${insets.left}px`);
    root.style.setProperty('--free-right', `${insets.right}px`);
    root.style.setProperty('--free-top', `${hb}px`);
    root.style.setProperty('--free-bottom', `${insets.bottom}px`);
    t?.setInsets(insets);
  }, [layout]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    [header, coffer, ledger, dock].forEach((r) => r.current && ro.observe(r.current));
    window.addEventListener('resize', measure);
    // the mobile sheet slides with a transform, which ResizeObserver cannot see
    const sheet = coffer.current;
    sheet?.addEventListener('transitionend', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      sheet?.removeEventListener('transitionend', measure);
    };
  }, [measure, ready, sheetCollapsed]);

  /* actions */
  const roll = useCallback(() => {
    const t = engine.current;
    if (!t) return;
    t.unlockAudio();
    if (live.current.phase === 'holding') return;
    const plan = buildPlan();
    if (!plan) {
      if (!live.current.draftError) toast(tRef.current.toast.empty);
      return;
    }
    t.uiSound('seal');
    pending.current = plan;
    t.roll(plan.phys.map((p) => ({ kind: p.kind })));
    if (compact) setLedgerOpen(false);
  }, [buildPlan, toast, compact]);

  const clearTable = () => {
    engine.current?.clear();
    setResult(null);
    setPhase('idle');
    setHasDice(false);
  };

  const commitTerms = (next: Term[]) => {
    setTerms(next);
    setDraft(next.length ? formulaText(next) : '');
    setDraftError(null);
  };

  const onDraft = (s: string) => {
    setDraft(s);
    if (!s.trim()) {
      setTerms([]);
      setDraftError(null);
      return;
    }
    const r = parseFormula(s);
    if ('error' in r) setDraftError(r.error);
    else {
      setTerms(r.terms);
      setDraftError(null);
    }
  };

  const onAdjust = (sides: Sides, delta: number) => {
    engine.current?.unlockAudio();
    engine.current?.uiSound('tick');
    const next = adjustCount(terms, sides, delta);
    if (next === terms && delta > 0) toast(t.toast.full(MAX_PHYSICAL), 'warn');
    commitTerms(next);
  };

  const rerollFrom = (e: HistoryEntry) => {
    if (e.mode === 'coc' && e.coc) {
      setMode('coc');
      setCoc(e.coc);
      live.current = { ...live.current, mode: 'coc', coc: e.coc };
    } else if (e.formula) {
      const r = parseFormula(e.formula);
      if ('error' in r) return;
      setMode('formula');
      commitTerms(r.terms);
      live.current = { ...live.current, mode: 'formula', terms: r.terms, draftError: null };
    }
    roll();
  };

  const onPreset = (f: string) => {
    const r = parseFormula(f);
    if ('error' in r) return;
    engine.current?.uiSound('tick');
    commitTerms(r.terms);
  };

  /* keyboard */
  useEffect(() => {
    // Space always throws (unless typing) — even when a button still holds focus from a click
    const spaceForUs = (e: KeyboardEvent) => {
      if (modal || e.code !== 'Space') return false;
      const el = document.activeElement as HTMLElement | null;
      return !(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
    };
    const onDown = (e: KeyboardEvent) => {
      if (!spaceForUs(e)) return;
      e.preventDefault();
      if (!e.repeat) roll();
    };
    const onUp = (e: KeyboardEvent) => {
      if (spaceForUs(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, [roll, modal]);

  const openModal = (m: 'settings' | 'help') => {
    engine.current?.unlockAudio();
    engine.current?.uiSound('page');
    setModal(m);
  };

  const patchSettings = (p: Partial<TableSettings>) => setSettings((s) => ({ ...s, ...p }));

  return (
    <div className={`app phase-${phase} layout-${layout} ${ready ? 'is-ready' : ''} ${layout === 'sheet' && sheetCollapsed ? 'sheet-collapsed' : ''}`}>
      <div ref={stage} className="stage" />
      <div ref={tagLayer} className="tag-layer" aria-hidden />

      <header ref={header} className="topbar">
        <div className="brand">
          <Sigil className="brand-sigil" />
          <div className="brand-text">
            <h1>{t.brand.title}</h1>
            <p>{t.brand.sub}</p>
          </div>
        </div>
        <div className="motto" aria-hidden>
          <span>— Alea iacta est —</span>
        </div>
        <nav className="top-actions">
          {compact && (
            <button className="icon-btn" onClick={() => setLedgerOpen(true)} aria-label={t.top.ledger} data-tip={t.top.ledger}>
              <IconLedger width={19} height={19} />
              {history.length > 0 && <span className="dot-count">{Math.min(99, history.length)}</span>}
            </button>
          )}
          <button
            className={`icon-btn ${settings.sound ? '' : 'is-muted'}`}
            onClick={() => {
              engine.current?.unlockAudio();
              patchSettings({ sound: !settings.sound });
            }}
            aria-label={settings.sound ? t.top.mute : t.top.unmute}
            data-tip={settings.sound ? t.top.mute : t.top.unmute}
          >
            <IconSound muted={!settings.sound} width={19} height={19} />
          </button>
          <button className="icon-btn" onClick={() => openModal('help')} aria-label={t.top.help} data-tip={t.top.help}>
            <IconCodex width={19} height={19} />
          </button>
          <button className="icon-btn" onClick={() => openModal('settings')} aria-label={t.top.settings} data-tip={t.top.settings}>
            <IconAstrolabe width={19} height={19} />
          </button>
          <button className="icon-btn lang-btn" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} aria-label={t.top.langTip} data-tip={t.top.langTip} lang={lang === 'zh' ? 'en' : 'zh'}>
            {t.top.langButton}
          </button>
        </nav>
      </header>

      <Coffer
        ref={coffer}
        mode={mode}
        onMode={(m) => {
          engine.current?.uiSound('tick');
          setMode(m);
        }}
        terms={terms}
        onAdjust={onAdjust}
        onModifier={(m) => commitTerms(setModifier(terms, m))}
        onClearDice={() => commitTerms([])}
        draft={draft}
        onDraft={onDraft}
        draftError={draftError ? t.formulaError(draftError) : ''}
        onPreset={onPreset}
        coc={coc}
        onCoc={setCoc}
        onSubmit={roll}
        collapsed={layout === 'sheet' && sheetCollapsed}
        onToggleCollapsed={layout === 'sheet' ? () => setSheetCollapsed((c) => !c) : undefined}
      />

      <Ledger
        ref={ledger}
        entries={history}
        onReroll={rerollFrom}
        onBurn={() => setModal('burn')}
        onNotify={toast}
        drawer={compact}
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
      />
      {compact && ledgerOpen && <div className="scrim" onClick={() => setLedgerOpen(false)} />}

      <Verdict result={result} visible={phase === 'settled' && !!result} />

      <button className={`view-reset ${viewManual ? 'is-shown' : ''}`} onClick={() => engine.current?.resetView()} tabIndex={viewManual ? 0 : -1}>
        <IconReroll width={14} height={14} />
        {t.viewReset}
      </button>

      <Dock
        ref={dock}
        phase={phase}
        onRoll={roll}
        onClear={clearTable}
        canClear={hasDice}
        touch={coarse}
        fast={settings.timeScale >= 1}
        onFast={() => patchSettings({ timeScale: settings.timeScale >= 1 ? DEFAULT_SETTINGS.timeScale : 1 })}
      />

      <Toasts items={toasts} />

      <SettingsModal open={modal === 'settings'} onClose={() => setModal(null)} settings={settings} onChange={patchSettings} />
      <HelpModal open={modal === 'help'} onClose={() => setModal(null)} />
      <ConfirmModal
        open={modal === 'burn'}
        onClose={() => setModal(null)}
        onConfirm={() => setHistory([])}
        title={t.confirm.title}
        body={t.confirm.body}
        confirmText={t.confirm.ok}
      />

      <Loader done={ready} error={error ? (error.code === 'noWebgl' ? t.loader.noWebgl : t.loader.initFailed(error.msg)) : null} />
    </div>
  );
}
