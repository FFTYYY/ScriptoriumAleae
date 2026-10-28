import { forwardRef, useEffect, useMemo, useState } from 'react';
import type { Outcome, Plan } from '../logic/roll';
import { Fleuron, IconSweep, sealPath, Sigil } from './Icons';

export type Phase = 'idle' | 'holding' | 'rolling' | 'settled';

export interface ShownResult {
  id: number;
  plan: Plan;
  outcome: Outcome;
  nudged: number;
  seconds: number;
}

function useCountUp(target: number, key: number | undefined) {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (key === undefined) return;
    const start = performance.now();
    const dur = Math.min(900, 380 + Math.abs(target) * 6);
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(target * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, key]);
  return v;
}

export function Verdict({ result, visible }: { result: ShownResult | null; visible: boolean }) {
  const total = useCountUp(result?.outcome.total ?? 0, result?.id);
  if (!result) return <div className="verdict-wrap" aria-hidden />;
  const { plan, outcome } = result;
  const title = plan.mode === 'coc' ? (plan.name ? `${plan.name} 检定` : '技能检定') : plan.text;
  const badge = outcome.badge;
  const many = outcome.parts.reduce((n, p) => n + p.dice.length, 0) > 14;
  return (
    <div className="verdict-wrap">
      <section key={result.id} className={`verdict ${visible ? 'is-shown' : ''} ${badge ? `has-badge tone-${badge.tone}` : ''}`} aria-live="polite">
        <div className="verdict-glow" aria-hidden />
        <div className="verdict-main">
          <div className="verdict-kicker">
            <span>结果 · EXITUS</span>
            <Fleuron className="kicker-fleuron" />
          </div>
          <div className="verdict-title">{title}</div>
          <div className={`verdict-parts ${many ? 'is-dense' : ''}`}>
            {outcome.parts.map((p, i) => (
              <span key={i} className="vpart">
                {i > 0 && <span className="op">{p.sign < 0 ? '−' : '+'}</span>}
                {p.isConst ? (
                  <span className="const">{p.value}</span>
                ) : (
                  <>
                    <span className="vlabel">{p.label}</span>
                    <span className="vrolls">
                      {p.dice.map((d, j) => (
                        <i key={j} className={`r tone-${d.tone}`}>
                          {d.text}
                        </i>
                      ))}
                    </span>
                  </>
                )}
              </span>
            ))}
          </div>
          {outcome.note && <div className="verdict-note">{outcome.note}</div>}
          {result.nudged > 0 && <div className="verdict-foot">有骰子斜靠未放平，已轻推 {result.nudged} 次使其倒下</div>}
        </div>
        <div className="verdict-rule" aria-hidden />
        <div className="verdict-total" aria-label={`总计 ${outcome.total}`}>
          {total}
        </div>
        {badge && (
          <div className={`stamp tone-${badge.tone}`}>
            <span>{badge.text}</span>
            <em>{badge.en}</em>
          </div>
        )}
      </section>
    </div>
  );
}

const HINT: Record<Phase, string> = {
  idle: '点击按钮或按空格掷骰；也可以在桌面上按住、拖动，松开即掷出',
  holding: '松开即掷出',
  rolling: '掷骰中…',
  settled: '滚轮缩放 · 中键拖动旋转 · 右键拖动平移',
};

export const Dock = forwardRef<
  HTMLDivElement,
  { phase: Phase; onRoll: () => void; onClear: () => void; fast: boolean; onFast: () => void; canClear: boolean; touch?: boolean }
>(function Dock({ phase, onRoll, onClear, fast, onFast, canClear, touch }, ref) {
  const outline = useMemo(() => sealPath(52, 60, 60, 1.7), []);
  const inner = useMemo(() => sealPath(38, 60, 60, 4.1), []);
  return (
    <div ref={ref} className={`dock phase-${phase}`}>
      <div className="dock-row">
        <button className="icon-btn" onClick={onClear} disabled={!canClear} aria-label="清空桌面" data-tip="清空桌面">
          <IconSweep width={19} height={19} />
        </button>
        <button className="seal" onClick={onRoll} aria-label="掷骰（空格）">
          <svg className="seal-svg" viewBox="0 0 120 120" aria-hidden>
            <defs>
              <radialGradient id="wax" cx="38%" cy="32%" r="75%">
                <stop offset="0%" stopColor="#b8323c" />
                <stop offset="45%" stopColor="#7c161f" />
                <stop offset="100%" stopColor="#3a070c" />
              </radialGradient>
              <radialGradient id="waxInner" cx="60%" cy="70%" r="70%">
                <stop offset="0%" stopColor="#5a0d14" />
                <stop offset="100%" stopColor="#8e1f28" />
              </radialGradient>
              <filter id="waxShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.6" />
              </filter>
            </defs>
            <path d={outline} fill="url(#wax)" filter="url(#waxShadow)" />
            <path d={inner} fill="url(#waxInner)" opacity="0.9" />
            <path d={inner} fill="none" stroke="#c94a50" strokeOpacity="0.35" strokeWidth="1" transform="translate(0.6 0.8)" />
            <circle cx="60" cy="60" r="33" fill="none" stroke="#2c0508" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="1.5 3.2" />
            <g className="seal-spin">
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return <circle key={i} cx={60 + Math.cos(a) * 44} cy={60 + Math.sin(a) * 44} r="1.6" fill="#e8b16a" opacity="0.55" />;
              })}
            </g>
          </svg>
          <span className="seal-glyph">掷</span>
          <span className="seal-ring" aria-hidden />
        </button>
        <button className={`icon-btn ${fast ? 'is-on' : ''}`} onClick={onFast} aria-label="快放" aria-pressed={fast} data-tip={fast ? '恢复默认速度 0.35×' : '快放：真实速度 1×'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
            <path d="M3.5 6.5v11l8-5.5zM12 6.5v11l8-5.5z" />
          </svg>
        </button>
      </div>
      <p className="dock-hint">{touch && phase === 'settled' ? '双指捏合缩放 · 双指拖动旋转' : touch && phase === 'idle' ? '点击按钮掷骰，或在桌面上按住拖动后松开' : HINT[phase]}</p>
    </div>
  );
});

export function Loader({ done, error }: { done: boolean; error: string | null }) {
  return (
    <div className={`loader ${done && !error ? 'is-done' : ''}`} role="status">
      <Sigil className="loader-sigil" />
      {error ? (
        <>
          <p className="loader-text">加载失败</p>
          <p className="loader-sub">{error}</p>
        </>
      ) : (
        <>
          <p className="loader-text">正在加载…</p>
        </>
      )}
    </div>
  );
}
