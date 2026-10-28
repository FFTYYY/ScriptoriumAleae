import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Corner, Fleuron, IconClose, IconMinus, IconPlus } from './Icons';

/* ───────────────────────── custom scroll area ───────────────────────── */

export function ScrollArea({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const vp = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);

  const metrics = useCallback(() => {
    const v = vp.current!;
    const trackH = track.current!.clientHeight;
    const ratio = v.clientHeight / Math.max(1, v.scrollHeight);
    const h = Math.max(30, trackH * ratio);
    return { v, trackH, h, max: v.scrollHeight - v.clientHeight };
  }, []);

  const update = useCallback(() => {
    if (!vp.current || !thumb.current || !root.current || !track.current) return;
    const { v, trackH, h, max } = metrics();
    const scrollable = max > 1;
    root.current.dataset.scrollable = String(scrollable);
    root.current.dataset.top = String(v.scrollTop <= 1);
    root.current.dataset.bottom = String(v.scrollTop >= max - 1);
    const top = scrollable ? ((trackH - h) * v.scrollTop) / max : 0;
    thumb.current.style.height = `${h}px`;
    thumb.current.style.transform = `translate3d(0, ${top}px, 0)`;
  }, [metrics]);

  useLayoutEffect(() => {
    const v = vp.current!;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    if (v.firstElementChild) ro.observe(v.firstElementChild);
    const mo = new MutationObserver(update);
    mo.observe(v, { childList: true, subtree: true });
    v.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      v.removeEventListener('scroll', update);
    };
  }, [update]);

  const onThumbDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, top: vp.current!.scrollTop };
    root.current!.dataset.dragging = 'true';
  };
  const onThumbMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const { v, trackH, h, max } = metrics();
    v.scrollTop = drag.current.top + ((e.clientY - drag.current.y) * max) / Math.max(1, trackH - h);
  };
  const onThumbUp = () => {
    drag.current = null;
    if (root.current) root.current.dataset.dragging = 'false';
  };
  const onTrackDown = (e: ReactPointerEvent) => {
    if (e.target !== track.current) return;
    const { v } = metrics();
    const r = thumb.current!.getBoundingClientRect();
    v.scrollBy({ top: e.clientY < r.top ? -v.clientHeight * 0.85 : v.clientHeight * 0.85, behavior: 'smooth' });
  };

  return (
    <div ref={root} className={`scroll-area ${className}`}>
      <div ref={vp} className="scroll-viewport">
        <div className="scroll-content">{children}</div>
      </div>
      <div ref={track} className="scroll-track" onPointerDown={onTrackDown} aria-hidden>
        <div ref={thumb} className="scroll-thumb" onPointerDown={onThumbDown} onPointerMove={onThumbMove} onPointerUp={onThumbUp} onPointerCancel={onThumbUp} />
      </div>
    </div>
  );
}

/* ───────────────────────── modal ───────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  latin,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  latin?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const lastFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      lastFocus.current = document.activeElement;
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 280);
    (lastFocus.current as HTMLElement | null)?.focus?.();
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && dialog.current) {
        const f = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    const id = requestAnimationFrame(() => dialog.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(id);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <div className={`modal-root ${open ? 'is-open' : 'is-closing'}`} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <Corner className="corner tl" />
        <Corner className="corner tr" />
        <Corner className="corner bl" />
        <Corner className="corner br" />
        <header className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {latin && <p className="latin">{latin}</p>}
          </div>
          <button className="icon-btn ghost" onClick={onClose} aria-label="关闭" data-tip="关闭 · Esc">
            <IconClose width={18} height={18} />
          </button>
        </header>
        <Fleuron className="modal-fleuron" />
        <ScrollArea className="modal-body">{children}</ScrollArea>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── stepper ───────────────────────── */

function useRepeat(fn: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fnRef = useRef(fn);
  const fired = useRef(false);
  fnRef.current = fn;
  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    window.clearInterval(timer.current);
  }, []);
  const start = useCallback(() => {
    stop();
    fired.current = false;
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(() => {
        fired.current = true;
        fnRef.current();
      }, 70);
    }, 420);
  }, [stop]);
  useEffect(() => stop, [stop]);
  /** true if the press auto-repeated (so the trailing click should be ignored) */
  const consume = () => {
    const f = fired.current;
    fired.current = false;
    return f;
  };
  return { start, stop, consume };
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  format,
  label,
  size = 'md',
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => ReactNode;
  label: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const vRef = useRef(value);
  vRef.current = value;
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  const dec = useRepeat(() => set(vRef.current - 1));
  const inc = useRepeat(() => set(vRef.current + 1));
  return (
    <div className={`stepper stepper-${size}`} role="group" aria-label={label}>
      <button
        className="step-btn"
        disabled={value <= min}
        onClick={() => !dec.consume() && set(value - 1)}
        onPointerDown={dec.start}
        onPointerUp={dec.stop}
        onPointerLeave={dec.stop}
        aria-label={`${label} 减一`}
      >
        <IconMinus width={14} height={14} />
      </button>
      <output className="step-val" aria-live="polite">
        {format ? format(value) : value}
      </output>
      <button
        className="step-btn"
        disabled={value >= max}
        onClick={() => !inc.consume() && set(value + 1)}
        onPointerDown={inc.start}
        onPointerUp={inc.stop}
        onPointerLeave={inc.stop}
        aria-label={`${label} 加一`}
      >
        <IconPlus width={14} height={14} />
      </button>
    </div>
  );
}

/* ───────────────────────── slider ───────────────────────── */

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  marks,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  marks?: number[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  const fromEvent = (e: ReactPointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onChange(clamp(min + t * (max - min)));
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const big = (max - min) / 10;
    const map: Record<string, number> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -big,
      PageUp: big,
    };
    if (e.key in map) {
      e.preventDefault();
      onChange(clamp(value + map[e.key]));
    } else if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
  };
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div
      ref={track}
      className={`slider ${dragging ? 'is-dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        fromEvent(e);
      }}
      onPointerMove={(e) => dragging && fromEvent(e)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <div className="slider-rail">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        {marks?.map((m) => (
          <span key={m} className="slider-mark" style={{ left: `${((m - min) / (max - min)) * 100}%` }} />
        ))}
      </div>
      <div className="slider-thumb" style={{ left: `${pct}%` }}>
        <span />
      </div>
    </div>
  );
}

/* ───────────────────────── toggle & segmented ───────────────────────── */

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
      <span className="toggle-text">{checked ? '开' : '关'}</span>
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  return (
    <div className="segmented" role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': idx } as CSSProperties}>
      <span className="seg-indicator" />
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} data-tip={o.hint}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── toasts ───────────────────────── */

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'warn';
}

export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone ?? 'info'}`}>
          <span className="toast-mark">✦</span>
          {t.text}
        </div>
      ))}
    </div>
  );
}
