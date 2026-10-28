import { forwardRef, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DieKind } from '../engine/dice';
import { countOf, modifierOf, physicalCount, MAX_PHYSICAL, type Sides, type Term } from '../logic/roll';
import type { CocState } from '../state';
import { Corner, DieIcon, Fleuron, IconMinus } from './Icons';
import { ScrollArea, Segmented, Slider, Stepper } from './controls';

const DICE: { sides: Sides; kind: DieKind; name: string; zh: string }[] = [
  { sides: 4, kind: 'd4', name: 'D4', zh: '四面' },
  { sides: 6, kind: 'd6', name: 'D6', zh: '六面' },
  { sides: 8, kind: 'd8', name: 'D8', zh: '八面' },
  { sides: 10, kind: 'd10', name: 'D10', zh: '十面' },
  { sides: 12, kind: 'd12', name: 'D12', zh: '十二面' },
  { sides: 20, kind: 'd20', name: 'D20', zh: '二十面' },
  { sides: 100, kind: 'd100', name: 'D%', zh: '百面' },
];

const PRESETS: { label: string; formula: string; hint: string }[] = [
  { label: '优势', formula: '2d20kh1', hint: '两颗 d20 取较高者' },
  { label: '劣势', formula: '2d20kl1', hint: '两颗 d20 取较低者' },
  { label: 'D&D 属性', formula: '4d6kh3', hint: '4d6 去掉最低的一颗' },
  { label: 'CoC 属性', formula: '3d6', hint: '三颗 d6 求和' },
  { label: '百分骰', formula: '1d100', hint: '十位骰 + 个位骰' },
  { label: '伤害', formula: '8d6', hint: '八颗 d6 求和' },
];

export interface CofferProps {
  mode: 'formula' | 'coc';
  onMode: (m: 'formula' | 'coc') => void;
  terms: Term[];
  onAdjust: (sides: Sides, delta: number) => void;
  onModifier: (m: number) => void;
  onClearDice: () => void;
  draft: string;
  onDraft: (s: string) => void;
  draftError: string;
  onPreset: (f: string) => void;
  coc: CocState;
  onCoc: (c: CocState) => void;
  onSubmit: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const Coffer = forwardRef<HTMLElement, CofferProps>(function Coffer(p, ref) {
  const mod = modifierOf(p.terms);
  const phys = physicalCount(p.terms);
  const [focused, setFocused] = useState(false);

  return (
    <aside ref={ref} className={`panel coffer ${p.collapsed ? 'is-collapsed' : ''}`} aria-label="骰子盒">
      <Corner className="corner tl" />
      <Corner className="corner tr" />
      <Corner className="corner bl" />
      <Corner className="corner br" />
      {p.onToggleCollapsed && (
        <button className="sheet-handle" onClick={p.onToggleCollapsed} aria-label={p.collapsed ? '展开面板' : '收起面板'}>
          <span />
        </button>
      )}
      <header className="panel-head">
        <h2>
          骰子盒<span className="latin">Arca Alearum</span>
        </h2>
        <Segmented
          label="掷骰模式"
          value={p.mode}
          onChange={p.onMode}
          options={[
            { value: 'formula', label: '普通掷骰' },
            { value: 'coc', label: 'CoC 检定' },
          ]}
        />
      </header>

      <ScrollArea className="panel-scroll">
        {p.mode === 'formula' ? (
          <div className="coffer-body">
            <div className="dice-grid">
              {DICE.map((d) => (
                <DieCard
                  key={d.sides}
                  die={d}
                  count={countOf(p.terms, d.sides)}
                  full={phys + (d.sides === 100 ? 2 : 1) > MAX_PHYSICAL}
                  onAdjust={p.onAdjust}
                />
              ))}
              <button className="die-card die-card-clear" onClick={p.onClearDice} disabled={phys === 0}>
                <span className="clear-glyph">∅</span>
                <span className="die-card-name">清空</span>
                <span className="die-card-zh">Vacua</span>
              </button>
            </div>

            <div className="field-row mod-row">
              <div className="field-label">
                调整值<span className="latin">Modificator</span>
              </div>
              <Stepper label="调整值" value={mod} min={-99} max={99} onChange={p.onModifier} format={(v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0')} />
            </div>

            <div className={`inscription ${focused ? 'is-focused' : ''} ${p.draftError ? 'has-error' : ''}`}>
              <label className="field-label" htmlFor="formula">
                表达式<span className="latin">Formula</span>
              </label>
              <input
                id="formula"
                className="inscription-input"
                value={p.draft}
                spellCheck={false}
                autoComplete="off"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={(e) => p.onDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                    p.onSubmit();
                  }
                }}
                placeholder="如 2d6 + 1d8 + 3"
              />
              <span className="inscription-line" />
              <p className="inscription-msg">{p.draftError || `共 ${phys} 颗骰子 · 回车掷骰`}</p>
            </div>

            <div className="presets">
              <Fleuron className="mini-fleuron" />
              <div className="chips">
                {PRESETS.map((c) => (
                  <button key={c.formula} className="chip" onClick={() => p.onPreset(c.formula)} data-tip={c.hint}>
                    <span>{c.label}</span>
                    <em>{c.formula}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <CocForm coc={p.coc} onCoc={p.onCoc} />
        )}
      </ScrollArea>
    </aside>
  );
});

/** Tap adds a die; right-click, the − button, or a long press on touch screens removes one. */
function DieCard({ die, count, full, onAdjust }: { die: (typeof DICE)[number]; count: number; full: boolean; onAdjust: (sides: Sides, delta: number) => void }) {
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const startPress = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch' || !count) return;
    longPressed.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onAdjust(die.sides, -1);
      navigator.vibrate?.(12);
    }, 450);
  };
  const endPress = () => window.clearTimeout(timer.current);
  return (
    <div className={`die-card ${count ? 'has' : ''}`}>
      <button
        className="die-card-main"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onClick={() => {
          // the release after a long press is not a tap
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onAdjust(die.sides, 1);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (longPressed.current) return;
          if (count) onAdjust(die.sides, -1);
        }}
        disabled={full}
        aria-label={`增加一颗 ${die.name}，当前 ${count} 颗（长按或右键减少）`}
      >
        <DieIcon kind={die.kind} className="die-card-icon" />
        <span className="die-card-name">{die.name}</span>
        <span className="die-card-zh">{die.zh}</span>
      </button>
      {count > 0 && (
        <>
          <span className="die-badge" aria-hidden>
            {count}
          </span>
          <button className="die-minus" onClick={() => onAdjust(die.sides, -1)} aria-label={`减少一颗 ${die.name}`}>
            <IconMinus width={12} height={12} />
          </button>
        </>
      )}
    </div>
  );
}

function CocForm({ coc, onCoc }: { coc: CocState; onCoc: (c: CocState) => void }) {
  const set = (patch: Partial<CocState>) => onCoc({ ...coc, ...patch });
  const half = Math.floor(coc.skill / 2);
  const fifth = Math.floor(coc.skill / 5);
  const net = coc.bonus - coc.penalty;
  return (
    <div className="coc-body">
      <div className="inscription coc-name">
        <label className="field-label" htmlFor="skill-name">
          技能名称<span className="latin">Peritia</span>
        </label>
        <input
          id="skill-name"
          className="inscription-input"
          value={coc.name}
          maxLength={16}
          placeholder="如 侦查、图书馆使用、理智"
          onChange={(e) => set({ name: e.target.value })}
        />
        <span className="inscription-line" />
      </div>

      <div className="skill-dial">
        <div className="field-label">
          技能值<span className="latin">Valor</span>
        </div>
        <div className="skill-value">
          <Stepper label="技能值" value={coc.skill} min={1} max={99} onChange={(v) => set({ skill: v })} size="lg" />
        </div>
        <Slider label="技能值" value={coc.skill} min={1} max={99} onChange={(v) => set({ skill: v })} marks={[25, 50, 75]} />
      </div>

      <div className="thresholds">
        <div>
          <span className="th-label">常规</span>
          <span className="th-val">≤ {coc.skill}</span>
        </div>
        <div>
          <span className="th-label">困难</span>
          <span className="th-val">≤ {half}</span>
        </div>
        <div>
          <span className="th-label">极难</span>
          <span className="th-val">≤ {fifth}</span>
        </div>
      </div>

      <div className="field-row coc-bonus">
        <div className="field-label">
          奖励骰<span className="latin">Bonus</span>
        </div>
        <Stepper label="奖励骰" value={coc.bonus} min={0} max={3} onChange={(v) => set({ bonus: v })} />
      </div>
      <div className="field-row coc-penalty">
        <div className="field-label">
          惩罚骰<span className="latin">Poena</span>
        </div>
        <Stepper label="惩罚骰" value={coc.penalty} min={0} max={3} onChange={(v) => set({ penalty: v })} />
      </div>

      <p className="coc-note">
        将掷出一颗个位骰和 <b>{1 + Math.abs(net)}</b> 颗十位骰
        {net > 0 ? '，取最低的十位。' : net < 0 ? '，取最高的十位。' : '。'}
        奖励骰与惩罚骰相互抵消。掷出 01 为大成功，{coc.skill < 50 ? '96–100' : '100'} 为大失败。
      </p>
    </div>
  );
}
