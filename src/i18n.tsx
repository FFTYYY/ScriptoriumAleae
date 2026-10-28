import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DieKind } from './engine/dice';
import { BADGE_EN, type Badge, type BadgeKey, type FormulaError, type Part } from './logic/roll';

/**
 * Two languages, chosen by the URL: no parameter is Chinese, `?lang=en` is English.
 * Switching rewrites the address in place (no reload), so links can be shared as-is.
 */

export type Lang = 'zh' | 'en';

const zh = {
  htmlLang: 'zh-CN',
  docTitle: '骰子书房 · Scriptorium Aleae',
  brand: { title: '骰子书房', sub: 'Scriptorium · Aleae' },
  top: {
    ledger: '掷骰记录',
    mute: '静音',
    unmute: '开启音效',
    help: '说明',
    settings: '设置',
    langButton: 'EN',
    langTip: 'Switch to English',
  },
  coffer: {
    title: '骰子盒',
    modeLabel: '掷骰模式',
    modeFormula: '普通掷骰',
    modeCoc: 'CoC 检定',
    expand: '展开面板',
    collapse: '收起面板',
    clear: '清空',
    modifier: '调整值',
    formula: '表达式',
    formulaPlaceholder: '如 2d6 + 1d8 + 3',
    count: (n: number) => `共 ${n} 颗骰子 · 回车掷骰`,
    addDie: (name: string, n: number) => `增加一颗 ${name}，当前 ${n} 颗（长按或右键减少）`,
    removeDie: (name: string) => `减少一颗 ${name}`,
    dieNames: { d4: '四面', d6: '六面', d8: '八面', d10: '十面', d12: '十二面', d20: '二十面', d100: '百面' } as Record<DieKind, string>,
    presets: {
      '2d20kh1': ['优势', '两颗 d20 取较高者'],
      '2d20kl1': ['劣势', '两颗 d20 取较低者'],
      '4d6kh3': ['D&D 属性', '4d6 去掉最低的一颗'],
      '3d6': ['CoC 属性', '三颗 d6 求和'],
      '1d100': ['百分骰', '十位骰 + 个位骰'],
      '8d6': ['伤害', '八颗 d6 求和'],
    } as Record<string, [string, string]>,
  },
  coc: {
    skillName: '技能名称',
    skillNamePlaceholder: '如 侦查、图书馆使用、理智',
    skill: '技能值',
    regular: '常规',
    hard: '困难',
    extreme: '极难',
    bonus: '奖励骰',
    penalty: '惩罚骰',
    note: (tens: number, net: number, skill: number) =>
      `将掷出一颗个位骰和 ${tens} 颗十位骰${net > 0 ? '，取最低的十位。' : net < 0 ? '，取最高的十位。' : '。'}奖励骰与惩罚骰相互抵消。掷出 01 为大成功，${skill < 50 ? '96–100' : '100'} 为大失败。`,
    historyTitle: (name: string, skill: number) => `${name || '检定'} · ${skill}`,
    verdictTitle: (name: string) => (name ? `${name} 检定` : '技能检定'),
    part: (tens: number) => (tens > 1 ? `十位 ×${tens} · 个位` : '十位 · 个位'),
    thresholds: (s: number, h: number, f: number) => `常规 ≤${s} · 困难 ≤${h} · 极难 ≤${f}`,
  },
  badges: {
    critical: '大成功',
    extreme: '极难成功',
    hard: '困难成功',
    regular: '成功',
    failure: '失败',
    fumble: '大失败',
    nat20: '自然 20',
    nat1: '自然 1',
  } as Record<BadgeKey, string>,
  /** whether the stamp shows the English name underneath */
  badgeSubtitle: true,
  ledger: {
    title: '掷骰记录',
    clear: '清空记录',
    close: '关闭',
    empty: '还没有记录',
    reroll: '再掷一次',
  },
  verdict: {
    kicker: '结果 · EXITUS',
    nudged: (n: number) => `有骰子斜靠未放平，已轻推 ${n} 次使其倒下`,
    total: (n: number) => `总计 ${n}`,
  },
  dock: {
    clear: '清空桌面',
    roll: '掷骰（空格）',
    glyph: '掷',
    fast: '快放',
    fastOn: '恢复默认速度 0.35×',
    fastOff: '快放：真实速度 1×',
    hint: {
      idle: '点击按钮或按空格掷骰；也可以在桌面上按住、拖动，松开即掷出',
      holding: '松开即掷出',
      rolling: '掷骰中…',
      settled: '滚轮缩放 · 中键拖动旋转 · 右键拖动平移',
    },
    touchHint: {
      idle: '点击按钮掷骰，或在桌面上按住拖动后松开',
      settled: '双指捏合缩放 · 双指拖动旋转',
    },
  },
  viewReset: '重置视角',
  loader: {
    loading: '正在加载…',
    failed: '加载失败',
    noWebgl: '此浏览器不支持 WebGL2，无法显示 3D 场景。请使用较新版本的 Chrome、Edge、Firefox 或 Safari。',
    initFailed: (m: string) => `渲染器初始化失败：${m}`,
  },
  toast: {
    empty: '还没有选择骰子。',
    full: (n: number) => `最多只能同时掷 ${n} 颗骰子`,
    badFormula: (e: string) => `表达式有误：${e}`,
  },
  formulaError: (e: FormulaError): string => {
    switch (e.code) {
      case 'empty':
        return '表达式为空';
      case 'unrecognized':
        return `无法识别：「${e.text}」`;
      case 'joiner':
        return '各项之间需以 + 或 − 相连';
      case 'constTooBig':
        return '常数过大';
      case 'badSides':
        return `不支持 d${e.sides}（可用 d4 d6 d8 d10 d12 d20 d100）`;
      case 'minCount':
        return '骰子数量至少为 1';
      case 'maxCount':
        return `一次最多 ${e.max} 颗骰子`;
      case 'keepRange':
        return '保留数需介于 1 与骰数之间';
      case 'dropRange':
        return '舍弃数需小于骰数';
      case 'noDice':
        return '至少需要一组骰子';
      case 'tooMany':
        return `共需 ${e.need} 颗骰子，超过上限 ${e.max}`;
    }
  },
  settings: {
    title: '设置',
    styles: '骰子样式',
    stylesDesc: '默认“随机生成”：每颗骰子的配色、花纹和材质都由程序当场生成，数字颜色按对比度自动挑选。也可以选一种固定样式让整组统一。',
    randomName: '随机生成',
    randomBlurb: '颜色、花纹、材质全部随机，每颗都不一样',
    felt: '桌布',
    feltLabel: '桌布颜色',
    speed: '播放速度',
    speedDefault: '0.35× 默认',
    speedReal: '1× 真实',
    speedDesc: '默认放慢到 0.35 倍，便于看清翻滚过程；1× 是真实速度。只改变播放速度，物理过程不变。',
    quality: '画质',
    high: '高',
    medium: '中',
    low: '低',
    qualityDesc: '“低”会关闭泛光与抗锯齿。画面卡顿时会自动降低渲染分辨率。',
    sound: '音效',
    volume: '音量',
    soundDesc: '碰撞声由物理引擎测得的冲量实时合成。',
  },
  confirm: {
    title: '清空记录',
    body: '将删除全部掷骰记录，且无法恢复。确定吗？',
    ok: '清空',
    cancel: '取消',
  },
  controls: {
    close: '关闭',
    closeTip: '关闭 · Esc',
    minus: (label: string) => `${label} 减一`,
    plus: (label: string) => `${label} 加一`,
    on: '开',
    off: '关',
  },
  help: { title: '说明' },
};

export type Messages = typeof zh;

const en: Messages = {
  htmlLang: 'en',
  docTitle: 'Dice Study · Scriptorium Aleae',
  brand: { title: 'Dice Study', sub: 'Scriptorium · Aleae' },
  top: {
    ledger: 'Roll log',
    mute: 'Mute',
    unmute: 'Turn sound on',
    help: 'Help',
    settings: 'Settings',
    langButton: '中',
    langTip: '切换到中文',
  },
  coffer: {
    title: 'Dice',
    modeLabel: 'Roll mode',
    modeFormula: 'Free roll',
    modeCoc: 'CoC check',
    expand: 'Expand panel',
    collapse: 'Collapse panel',
    clear: 'Clear',
    modifier: 'Modifier',
    formula: 'Formula',
    formulaPlaceholder: 'e.g. 2d6 + 1d8 + 3',
    count: (n: number) => `${n} ${n === 1 ? 'die' : 'dice'} · Enter to roll`,
    addDie: (name: string, n: number) => `Add a ${name}, ${n} now (long-press or right-click to remove)`,
    removeDie: (name: string) => `Remove a ${name}`,
    dieNames: { d4: '4 sides', d6: '6 sides', d8: '8 sides', d10: '10 sides', d12: '12 sides', d20: '20 sides', d100: 'percentile' },
    presets: {
      '2d20kh1': ['Advantage', 'Two d20, keep the higher'],
      '2d20kl1': ['Disadvantage', 'Two d20, keep the lower'],
      '4d6kh3': ['D&D ability', '4d6, drop the lowest'],
      '3d6': ['CoC trait', 'Sum of three d6'],
      '1d100': ['Percentile', 'Tens die + units die'],
      '8d6': ['Damage', 'Sum of eight d6'],
    },
  },
  coc: {
    skillName: 'Skill',
    skillNamePlaceholder: 'e.g. Spot Hidden, Library Use, Sanity',
    skill: 'Skill value',
    regular: 'Regular',
    hard: 'Hard',
    extreme: 'Extreme',
    bonus: 'Bonus dice',
    penalty: 'Penalty dice',
    note: (tens: number, net: number, skill: number) =>
      `Rolls one units die and ${tens} tens ${tens === 1 ? 'die' : 'dice'}${net > 0 ? ', keeping the lowest tens.' : net < 0 ? ', keeping the highest tens.' : '.'} Bonus and penalty dice cancel out. 01 is a critical success; ${skill < 50 ? '96–100' : '100'} is a fumble.`,
    historyTitle: (name: string, skill: number) => `${name || 'Check'} · ${skill}`,
    verdictTitle: (name: string) => (name ? `${name} check` : 'Skill check'),
    part: (tens: number) => (tens > 1 ? `tens ×${tens} · units` : 'tens · units'),
    thresholds: (s: number, h: number, f: number) => `Regular ≤${s} · Hard ≤${h} · Extreme ≤${f}`,
  },
  badges: {
    critical: 'Critical',
    extreme: 'Extreme',
    hard: 'Hard',
    regular: 'Success',
    failure: 'Failure',
    fumble: 'Fumble',
    nat20: 'Natural 20',
    nat1: 'Natural 1',
  },
  badgeSubtitle: false,
  ledger: {
    title: 'Roll log',
    clear: 'Clear log',
    close: 'Close',
    empty: 'Nothing rolled yet',
    reroll: 'Roll again',
  },
  verdict: {
    kicker: 'RESULT · EXITUS',
    nudged: (n: number) => `A die was left leaning; it was nudged ${n} ${n === 1 ? 'time' : 'times'} until it fell flat`,
    total: (n: number) => `Total ${n}`,
  },
  dock: {
    clear: 'Clear table',
    roll: 'Roll (Space)',
    glyph: 'ROLL',
    fast: 'Fast',
    fastOn: 'Back to default speed 0.35×',
    fastOff: 'Fast: real speed 1×',
    hint: {
      idle: 'Press the button or Space to roll — or press on the table, drag, and let go',
      holding: 'Let go to throw',
      rolling: 'Rolling…',
      settled: 'Wheel to zoom · middle-drag to rotate · right-drag to pan',
    },
    touchHint: {
      idle: 'Tap the button to roll, or press on the table, drag and let go',
      settled: 'Pinch to zoom · two-finger drag to rotate',
    },
  },
  viewReset: 'Reset view',
  loader: {
    loading: 'Loading…',
    failed: 'Could not load',
    noWebgl: 'This browser does not support WebGL2, so the 3D table cannot be shown. Please use a recent Chrome, Edge, Firefox or Safari.',
    initFailed: (m: string) => `Renderer failed to start: ${m}`,
  },
  toast: {
    empty: 'No dice selected yet.',
    full: (n: number) => `At most ${n} dice at once`,
    badFormula: (e: string) => `Formula error: ${e}`,
  },
  formulaError: (e: FormulaError): string => {
    switch (e.code) {
      case 'empty':
        return 'The formula is empty';
      case 'unrecognized':
        return `Can't read “${e.text}”`;
      case 'joiner':
        return 'Join terms with + or −';
      case 'constTooBig':
        return 'Number too large';
      case 'badSides':
        return `No d${e.sides} here (available: d4 d6 d8 d10 d12 d20 d100)`;
      case 'minCount':
        return 'Roll at least one die';
      case 'maxCount':
        return `At most ${e.max} dice at once`;
      case 'keepRange':
        return 'Keep between 1 and the number of dice';
      case 'dropRange':
        return 'Drop fewer dice than you roll';
      case 'noDice':
        return 'Add at least one group of dice';
      case 'tooMany':
        return `That needs ${e.need} dice; the limit is ${e.max}`;
    }
  },
  settings: {
    title: 'Settings',
    styles: 'Dice style',
    stylesDesc: 'By default every die is generated on the spot — its colours, pattern and material are all random, and the numeral colour is picked for contrast. You can also pick one fixed style for a matching set.',
    randomName: 'Random',
    randomBlurb: 'Colours, pattern and material all random; no two alike',
    felt: 'Felt',
    feltLabel: 'Felt colour',
    speed: 'Playback speed',
    speedDefault: '0.35× default',
    speedReal: '1× real',
    speedDesc: 'Slowed to 0.35× by default so you can follow the tumble; 1× is real time. Only playback changes — the physics are the same.',
    quality: 'Quality',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    qualityDesc: '“Low” turns off bloom and anti-aliasing. Resolution also drops automatically if frames start to stutter.',
    sound: 'Sound',
    volume: 'Volume',
    soundDesc: 'Collision sounds are synthesised from the impulses the physics engine measures.',
  },
  confirm: {
    title: 'Clear log',
    body: 'This deletes every entry in the roll log and cannot be undone. Continue?',
    ok: 'Clear',
    cancel: 'Cancel',
  },
  controls: {
    close: 'Close',
    closeTip: 'Close · Esc',
    minus: (label: string) => `${label}: decrease`,
    plus: (label: string) => `${label}: increase`,
    on: 'On',
    off: 'Off',
  },
  help: { title: 'Help' },
};

const MESSAGES: Record<Lang, Messages> = { zh, en };

/** Words for a result stamp; older saved rolls carry their words with them. */
export function badgeWords(t: Messages, b: Badge): { main: string; sub?: string } {
  if (b.key) return { main: t.badges[b.key], sub: t.badgeSubtitle ? BADGE_EN[b.key] : undefined };
  return { main: b.text ?? '', sub: b.en };
}

export function partLabel(t: Messages, p: Part): string {
  return p.coc ? t.coc.part(p.coc) : p.label;
}

function langFromUrl(): Lang {
  return new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'zh';
}

function writeLangToUrl(lang: Lang) {
  const url = new URL(window.location.href);
  if (lang === 'en') url.searchParams.set('lang', 'en');
  else url.searchParams.delete('lang');
  window.history.replaceState(window.history.state, '', url);
}

interface I18n {
  lang: Lang;
  t: Messages;
  setLang(lang: Lang): void;
}

const I18nContext = createContext<I18n>({ lang: 'zh', t: zh, setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(langFromUrl);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeLangToUrl(l);
  }, []);
  useEffect(() => {
    document.documentElement.lang = MESSAGES[lang].htmlLang;
    document.title = MESSAGES[lang].docTitle;
  }, [lang]);
  const value = useMemo(() => ({ lang, t: MESSAGES[lang], setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
