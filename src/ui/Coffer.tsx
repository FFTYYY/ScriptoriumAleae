import { forwardRef, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { DieKind } from '../engine/dice';
import { countOf, modifierOf, physicalCount, MAX_PHYSICAL, type Sides, type Term } from '../logic/roll';
import type { CocState } from '../state';
import { Corner, DieIcon, Fleuron, IconMinus } from './Icons';
import { ScrollArea, Segmented, Slider, Stepper } from './controls';
import { useI18n } from '../i18n';

const DICE: { sides: Sides; kind: DieKind; name: string }[] = [
  { sides: 4, kind: 'd4', name: 'D4' },
  { sides: 6, kind: 'd6', name: 'D6' },
  { sides: 8, kind: 'd8', name: 'D8' },
  { sides: 10, kind: 'd10', name: 'D10' },
  { sides: 12, kind: 'd12', name: 'D12' },
  { sides: 20, kind: 'd20', name: 'D20' },
  { sides: 100, kind: 'd100', name: 'D%' },
];

/** label and tooltip come from the message table, keyed by formula */
const PRESETS = ['2d20kh1', '2d20kl1', '4d6kh3', '3d6', '1d100', '8d6'];

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
  const { t } = useI18n();
  const mod = modifierOf(p.terms);
  const phys = physicalCount(p.terms);
  const [focused, setFocused] = useState(false);

  return (
    <aside ref={ref} className={`panel coffer ${p.collapsed ? 'is-collapsed' : ''}`} aria-label={t.coffer.title}>
      <Corner className="corner tl" />
      <Corner className="corner tr" />
      <Corner className="corner bl" />
      <Corner className="corner br" />
      {p.onToggleCollapsed && (
        <button className="sheet-handle" onClick={p.onToggleCollapsed} aria-label={p.collapsed ? t.coffer.expand : t.coffer.collapse}>
          <span />
        </button>
      )}
      <header className="panel-head">
        <h2>
          {t.coffer.title}
          <span className="latin">Arca Alearum</span>
        </h2>
        <Segmented
          label={t.coffer.modeLabel}
          value={p.mode}
          onChange={p.onMode}
          options={[
            { value: 'formula', label: t.coffer.modeFormula },
            { value: 'coc', label: t.coffer.modeCoc },
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
                <span className="die-card-name">{t.coffer.clear}</span>
                <span className="die-card-zh">Vacua</span>
              </button>
            </div>

            <div className="field-row mod-row">
              <div className="field-label">
                {t.coffer.modifier}
                <span className="latin">Modificator</span>
              </div>
              <Stepper label={t.coffer.modifier} value={mod} min={-99} max={99} onChange={p.onModifier} format={(v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0')} />
            </div>

            <div className={`inscription ${focused ? 'is-focused' : ''} ${p.draftError ? 'has-error' : ''}`}>
              <label className="field-label" htmlFor="formula">
                {t.coffer.formula}
                <span className="latin">Formula</span>
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
                placeholder={t.coffer.formulaPlaceholder}
              />
              <span className="inscription-line" />
              <p className="inscription-msg">{p.draftError || t.coffer.count(phys)}</p>
            </div>

            <div className="presets">
              <Fleuron className="mini-fleuron" />
              <div className="chips">
                {PRESETS.map((f) => (
                  <button key={f} className="chip" onClick={() => p.onPreset(f)} data-tip={t.coffer.presets[f][1]}>
                    <span>{t.coffer.presets[f][0]}</span>
                    <em>{f}</em>
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
  const { t } = useI18n();
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
        aria-label={t.coffer.addDie(die.name, count)}
      >
        <DieIcon kind={die.kind} className="die-card-icon" />
        <span className="die-card-name">{die.name}</span>
        <span className="die-card-zh">{t.coffer.dieNames[die.kind]}</span>
      </button>
      {count > 0 && (
        <>
          <span className="die-badge" aria-hidden>
            {count}
          </span>
          <button className="die-minus" onClick={() => onAdjust(die.sides, -1)} aria-label={t.coffer.removeDie(die.name)}>
            <IconMinus width={12} height={12} />
          </button>
        </>
      )}
    </div>
  );
}

function CocForm({ coc, onCoc }: { coc: CocState; onCoc: (c: CocState) => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<CocState>) => onCoc({ ...coc, ...patch });
  const half = Math.floor(coc.skill / 2);
  const fifth = Math.floor(coc.skill / 5);
  const net = coc.bonus - coc.penalty;
  return (
    <div className="coc-body">
      <div className="inscription coc-name">
        <label className="field-label" htmlFor="skill-name">
          {t.coc.skillName}
          <span className="latin">Peritia</span>
        </label>
        <input
          id="skill-name"
          className="inscription-input"
          value={coc.name}
          maxLength={16}
          placeholder={t.coc.skillNamePlaceholder}
          onChange={(e) => set({ name: e.target.value })}
        />
        <span className="inscription-line" />
      </div>

      <div className="skill-dial">
        <div className="field-label">
          {t.coc.skill}
          <span className="latin">Valor</span>
        </div>
        <div className="skill-value">
          <Stepper label={t.coc.skill} value={coc.skill} min={1} max={99} onChange={(v) => set({ skill: v })} size="lg" />
        </div>
        <Slider label={t.coc.skill} value={coc.skill} min={1} max={99} onChange={(v) => set({ skill: v })} marks={[25, 50, 75]} />
      </div>

      <div className="thresholds">
        <div>
          <span className="th-label">{t.coc.regular}</span>
          <span className="th-val">≤ {coc.skill}</span>
        </div>
        <div>
          <span className="th-label">{t.coc.hard}</span>
          <span className="th-val">≤ {half}</span>
        </div>
        <div>
          <span className="th-label">{t.coc.extreme}</span>
          <span className="th-val">≤ {fifth}</span>
        </div>
      </div>

      <div className="field-row coc-bonus">
        <div className="field-label">
          {t.coc.bonus}
          <span className="latin">Bonus</span>
        </div>
        <Stepper label={t.coc.bonus} value={coc.bonus} min={0} max={3} onChange={(v) => set({ bonus: v })} />
      </div>
      <div className="field-row coc-penalty">
        <div className="field-label">
          {t.coc.penalty}
          <span className="latin">Poena</span>
        </div>
        <Stepper label={t.coc.penalty} value={coc.penalty} min={0} max={3} onChange={(v) => set({ penalty: v })} />
      </div>

      <p className="coc-note">{t.coc.note(1 + Math.abs(net), net, coc.skill)}</p>
    </div>
  );
}
