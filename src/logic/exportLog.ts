import type { HistoryEntry } from '../state';
import { badgeWords, partLabel, type Messages } from '../i18n';

/** Roll-log export as plain text or CSV, worded in the current language, oldest roll first. */

const pad = (n: number) => String(n).padStart(2, '0');

export function timeStamp(ms: number, seconds = true): string {
  const d = new Date(ms);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(d.getSeconds())}` : ''}`;
  return `${date} ${time}`;
}

function title(t: Messages, e: HistoryEntry): string {
  return e.mode === 'coc' && e.coc ? t.coc.historyTitle(e.coc.name, e.coc.skill) : (e.formula ?? e.title);
}

/** e.g. "2d20kh1 [17, (4)] + 1d6 [3] + 2" — dice in parentheses were not counted */
function detail(t: Messages, e: HistoryEntry): string {
  return e.parts
    .map((p, i) => {
      const op = i === 0 ? (p.sign < 0 ? '−' : '') : p.sign < 0 ? ' − ' : ' + ';
      if (p.isConst) return `${op}${p.value}`;
      const dice = p.dice.map((d) => (d.tone === 'muted' ? `(${d.text})` : d.text)).join(', ');
      return `${op}${partLabel(t, p)} [${dice}]`;
    })
    .join('');
}

function mark(t: Messages, e: HistoryEntry): string {
  return e.badge ? badgeWords(t, e.badge).main : '';
}

const hasDropped = (entries: HistoryEntry[]) => entries.some((e) => e.parts.some((p) => p.dice.some((d) => d.tone === 'muted')));

export function logToText(entries: HistoryEntry[], t: Messages, now = Date.now()): string {
  const x = t.exportLog;
  const rows = [...entries].reverse();
  const lines = [x.heading, `${x.exportedAt(timeStamp(now, false))} · ${x.count(rows.length)}`];
  if (hasDropped(rows)) lines.push(x.droppedNote);
  lines.push('');
  rows.forEach((e, i) => {
    const badge = mark(t, e);
    lines.push(`${i + 1}.  ${timeStamp(e.at)}`);
    lines.push(`    ${title(t, e)} = ${e.total}${badge ? ` · ${badge}` : ''}`);
    lines.push(`    ${detail(t, e)}`);
    lines.push('');
  });
  return lines.join('\n');
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function logToCsv(entries: HistoryEntry[], t: Messages): string {
  const rows = [...entries].reverse();
  const out = [t.exportLog.csvHeaders.map(csvCell).join(',')];
  rows.forEach((e, i) => {
    out.push([i + 1, timeStamp(e.at), title(t, e), e.total, detail(t, e), mark(t, e)].map(csvCell).join(','));
  });
  // the BOM lets Excel recognise UTF-8, so Chinese text is not garbled
  return '﻿' + out.join('\r\n') + '\r\n';
}

export function fileName(ext: 'txt' | 'csv', now = Date.now()): string {
  const d = new Date(now);
  return `dice-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}

export function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers or an insecure context: fall back to a hidden textarea
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
