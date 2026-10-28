import { forwardRef, type CSSProperties } from 'react';
import type { HistoryEntry } from '../state';
import { toRoman } from '../state';
import { Corner, IconClose, IconFeather, IconFlame, IconReroll } from './Icons';
import { ScrollArea } from './controls';
import { badgeWords, useI18n } from '../i18n';

function timeText(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface LedgerProps {
  entries: HistoryEntry[];
  onReroll: (e: HistoryEntry) => void;
  onBurn: () => void;
  open?: boolean;
  onClose?: () => void;
  drawer?: boolean;
}

export const Ledger = forwardRef<HTMLElement, LedgerProps>(function Ledger({ entries, onReroll, onBurn, open, onClose, drawer }, ref) {
  const { t } = useI18n();
  return (
    <aside ref={ref} className={`panel ledger ${drawer ? 'is-drawer' : ''} ${open ? 'is-open' : ''}`} aria-label={t.ledger.title}>
      <Corner className="corner tl" />
      <Corner className="corner tr" />
      <Corner className="corner bl" />
      <Corner className="corner br" />
      <header className="panel-head">
        <h2>
          {t.ledger.title}
          <span className="latin">Liber Factorum</span>
        </h2>
        <div className="panel-head-actions">
          <button className="icon-btn ghost sm" onClick={onBurn} disabled={!entries.length} aria-label={t.ledger.clear} data-tip={t.ledger.clear}>
            <IconFlame width={17} height={17} />
          </button>
          {drawer && (
            <button className="icon-btn ghost sm" onClick={onClose} aria-label={t.ledger.close}>
              <IconClose width={17} height={17} />
            </button>
          )}
        </div>
      </header>
      <ScrollArea className="panel-scroll">
        {entries.length === 0 ? (
          <div className="ledger-empty">
            <IconFeather width={54} height={54} />
            <p>{t.ledger.empty}</p>
            <p className="latin">Nihil adhuc scriptum est.</p>
          </div>
        ) : (
          <ol className="ledger-list">
            {entries.map((e, i) => {
              const n = entries.length - i;
              return (
                <li key={e.id} className={`entry ${e.badge ? `badge-${e.badge.tone}` : ''}`} style={{ '--i': i } as CSSProperties}>
                  <div className="entry-num">{toRoman(n)}</div>
                  <div className="entry-main">
                    <div className="entry-title">
                      <span className="entry-formula">{e.mode === 'coc' && e.coc ? t.coc.historyTitle(e.coc.name, e.coc.skill) : (e.formula ?? e.title)}</span>
                      <span className="entry-time">{timeText(e.at)}</span>
                    </div>
                    <div className="entry-parts">
                      {e.parts.map((p, pi) => (
                        <span key={pi} className="entry-part">
                          {pi > 0 && <span className="op">{p.sign < 0 ? '−' : '+'}</span>}
                          {p.isConst ? (
                            <span className="const">{p.value}</span>
                          ) : (
                            <span className="rolls">
                              {p.dice.map((d, di) => (
                                <i key={di} className={`r tone-${d.tone}`}>
                                  {d.text}
                                </i>
                              ))}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    {e.badge && <div className={`entry-badge tone-${e.badge.tone}`}>{badgeWords(t, e.badge).main}</div>}
                  </div>
                  <div className="entry-total">{e.total}</div>
                  <button className="entry-reroll" onClick={() => onReroll(e)} aria-label={t.ledger.reroll} data-tip={t.ledger.reroll}>
                    <IconReroll width={15} height={15} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </ScrollArea>
    </aside>
  );
});
