import type { TableSettings } from '../engine/DiceTable';
import { DICE_STYLES } from '../engine/materials';
import { FELT_COLORS } from '../engine/scenery';
import { useI18n } from '../i18n';
import { Modal, Segmented, Slider, Toggle } from './controls';
import { DieIcon } from './Icons';

export function SettingsModal({
  open,
  onClose,
  settings,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  settings: TableSettings;
  onChange: (p: Partial<TableSettings>) => void;
}) {
  const { t, lang } = useI18n();
  const s = t.settings;
  const current = settings.styleId;
  return (
    <Modal open={open} onClose={onClose} title={s.title} wide>
      <section className="set-section">
        <h3>
          {s.styles}
          <span className="latin">Ornatus</span>
        </h3>
        <p className="set-desc">{s.stylesDesc}</p>
        <div className="style-grid" role="radiogroup" aria-label={s.styles}>
          <button role="radio" aria-checked={current === 'random'} className={`style-tile ${current === 'random' ? 'on' : ''}`} onClick={() => onChange({ styleId: 'random' })}>
            <span className="style-swatch swatch-random" />
            <span className="style-name">{s.randomName}</span>
            <span className="style-latin">Varietas</span>
            <span className="style-blurb">{s.randomBlurb}</span>
          </button>
          {DICE_STYLES.map((st) => (
            <button key={st.id} role="radio" aria-checked={current === st.id} className={`style-tile ${current === st.id ? 'on' : ''}`} onClick={() => onChange({ styleId: st.id })}>
              <span className="style-swatch" style={{ background: st.swatch }} />
              <span className="style-name">{lang === 'en' ? (st.nameEn ?? st.name) : st.name}</span>
              <span className="style-latin">{st.latin}</span>
              <span className="style-blurb">{lang === 'en' ? (st.blurbEn ?? st.blurb) : st.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="set-section">
        <h3>
          {s.felt}
          <span className="latin">Pannus</span>
        </h3>
        <div className="felt-row" role="radiogroup" aria-label={s.feltLabel}>
          {Object.entries(FELT_COLORS).map(([id, f]) => (
            <button key={id} role="radio" aria-checked={settings.felt === id} className={`felt-dot ${settings.felt === id ? 'on' : ''}`} onClick={() => onChange({ felt: id })}>
              <span style={{ background: `radial-gradient(circle at 35% 30%, ${f.sheen}, ${f.color} 60%)` }} />
              <em>{lang === 'en' ? f.nameEn : f.name}</em>
            </button>
          ))}
        </div>
      </section>

      <div className="set-grid">
        <section className="set-section">
          <h3>
            {s.speed}
            <span className="latin">Tempus</span>
          </h3>
          <Segmented
            label={s.speed}
            value={settings.timeScale}
            onChange={(v) => onChange({ timeScale: v })}
            options={[
              { value: 0.15, label: '0.15×' },
              { value: 0.35, label: s.speedDefault },
              { value: 0.5, label: '0.5×' },
              { value: 1, label: s.speedReal },
            ]}
          />
          <p className="set-desc">{s.speedDesc}</p>
        </section>
        <section className="set-section">
          <h3>
            {s.quality}
            <span className="latin">Claritas</span>
          </h3>
          <Segmented
            label={s.quality}
            value={settings.quality}
            onChange={(v) => onChange({ quality: v })}
            options={[
              { value: 'high', label: s.high },
              { value: 'medium', label: s.medium },
              { value: 'low', label: s.low },
            ]}
          />
          <p className="set-desc">{s.qualityDesc}</p>
        </section>
        <section className="set-section">
          <h3>
            {s.sound}
            <span className="latin">Sonus</span>
          </h3>
          <div className="sound-row">
            <Toggle checked={settings.sound} onChange={(v) => onChange({ sound: v })} label={s.sound} />
            <div className={`vol ${settings.sound ? '' : 'is-off'}`}>
              <Slider label={s.volume} value={Math.round(settings.volume * 100)} min={0} max={100} onChange={(v) => onChange({ volume: v / 100 })} />
              <span className="vol-num">{Math.round(settings.volume * 100)}</span>
            </div>
          </div>
          <p className="set-desc">{s.soundDesc}</p>
        </section>
      </div>
    </Modal>
  );
}

const FAIR_ICONS = (
  <div className="fair-icons">
    {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const).map((k) => (
      <DieIcon key={k} kind={k} width={30} height={30} />
    ))}
  </div>
);

function HelpZh() {
  return (
    <div className="codex">
      <section>
        <h3>
          如何掷骰<span className="latin">De Iactu</span>
        </h3>
        <ul className="codex-list">
          <li>
            在<b>骰子盒</b>中点击骰子增加数量，右键、点 <kbd>−</kbd> 或在手机上长按减少；也可以直接输入<b>表达式</b>。
          </li>
          <li>
            点击下方的<b>掷骰按钮</b>，或按 <kbd>空格</kbd>，骰子会从骰盘一侧掷出。默认以 0.35 倍速播放，点右侧的<b>快放</b>按钮切到真实速度。
          </li>
          <li>
            也可以在<b>桌面上按住鼠标</b>：骰子会出现在指针下方，拖动可以摇晃，<b>朝某个方向甩动后松开</b>即掷出，速度和方向取决于你的手势。
          </li>
          <li>所有骰子静止后，直接按朝上的面读数（d4 读朝上的顶点）。</li>
          <li>
            骰子停下后可以调整视角：<b>滚轮</b>缩放，按住<b>中键</b>拖动旋转，按住<b>右键</b>拖动平移；点击<b>重置视角</b>恢复。
          </li>
        </ul>
      </section>
      <section>
        <h3>
          表达式语法<span className="latin">Grammatica</span>
        </h3>
        <table className="codex-table">
          <tbody>
            <tr>
              <td>
                <code>3d6 + 2</code>
              </td>
              <td>三颗 d6 之和再加 2</td>
            </tr>
            <tr>
              <td>
                <code>1d20 + 1d4 − 1</code>
              </td>
              <td>多组骰子与常数可以任意组合</td>
            </tr>
            <tr>
              <td>
                <code>2d20kh1</code> / <code>2d20kl1</code>
              </td>
              <td>保留最高 / 最低的一颗（优势 / 劣势）</td>
            </tr>
            <tr>
              <td>
                <code>4d6dl1</code>
              </td>
              <td>去掉最低的一颗（等同 4d6kh3）</td>
            </tr>
            <tr>
              <td>
                <code>1d100</code> 或 <code>d%</code>
              </td>
              <td>百分骰：一颗十位骰（00–90）加一颗个位骰（0–9），00 + 0 记为 100</td>
            </tr>
          </tbody>
        </table>
        <p className="codex-p">可用骰子：d4、d6、d8、d10、d12、d20、d100。单独掷 d10 时 “0” 面记作 10。一次最多 36 颗骰子。</p>
      </section>
      <section>
        <h3>
          CoC 检定<span className="latin">Probatio</span>
        </h3>
        <p className="codex-p">
          依《克苏鲁的呼唤》第七版规则：掷 1d100，结果 ≤ 技能值为成功；≤ 一半为<b>困难成功</b>；≤ 五分之一为<b>极难成功</b>；01 为<b>大成功</b>。
          技能值低于 50 时 96–100 为<b>大失败</b>，否则仅 100 为大失败。
        </p>
        <p className="codex-p">
          <b>奖励骰</b>与<b>惩罚骰</b>会真的多掷出十位骰：奖励取最低的十位，惩罚取最高的十位，两者相互抵消。
        </p>
      </section>
      <section>
        <h3>
          关于公平<span className="latin">De Aequitate</span>
        </h3>
        <div className="fair">
          {FAIR_ICONS}
          <ul className="codex-list">
            <li>每颗骰子都由精确的多面体顶点生成，碰撞外形与可见外形共用同一组面。</li>
            <li>
              质量按<b>均匀密度</b>积分：质心严格位于几何中心，转动惯量按多面体精确计算——<b>没有灌铅</b>。
            </li>
            <li>点数从不预先决定。初始位置、朝向、速度与旋转取自浏览器的密码学随机源，此后一切交给重力、碰撞、摩擦与弹性。</li>
            <li>如果骰子斜靠在墙边或其他骰子上没有放平，会给它一个很小的推力，让它按物理规律倒向一侧。</li>
            <li>不同材质密度不同（黄铜沉、琥珀轻），但每一颗都内外均匀。</li>
          </ul>
        </div>
      </section>
      <section>
        <h3>
          快捷键与鼠标<span className="latin">Claves</span>
        </h3>
        <div className="keys">
          <span>
            <kbd>空格</kbd> 掷骰
          </span>
          <span>
            <kbd>Esc</kbd> 关闭窗口
          </span>
          <span>
            <kbd>回车</kbd> 在表达式栏中直接掷骰
          </span>
          <span>
            <kbd>滚轮</kbd> 缩放
          </span>
          <span>
            <kbd>中键拖动</kbd> 旋转视角
          </span>
          <span>
            <kbd>右键拖动</kbd> 平移视角
          </span>
        </div>
      </section>
    </div>
  );
}

function HelpEn() {
  return (
    <div className="codex">
      <section>
        <h3>
          Rolling<span className="latin">De Iactu</span>
        </h3>
        <ul className="codex-list">
          <li>
            Click a die in the <b>Dice</b> panel to add one; right-click, press <kbd>−</kbd> or long-press on a phone to remove one. You can also type a <b>formula</b>.
          </li>
          <li>
            Press the <b>roll button</b> or <kbd>Space</kbd> and the dice are thrown in from one side of the tray. Playback runs at 0.35× by default; the <b>fast</b> button next to it switches to real speed.
          </li>
          <li>
            Or <b>press and hold on the table</b>: the dice appear under the pointer, dragging shakes them, and <b>flicking in a direction and letting go</b> throws them — speed and direction follow your hand.
          </li>
          <li>Once every die is still, each is read by the face pointing up (for a d4, the vertex pointing up).</li>
          <li>
            After a roll you can look around: <b>scroll</b> to zoom, <b>middle-drag</b> to rotate, <b>right-drag</b> to pan; <b>Reset view</b> brings the camera back.
          </li>
        </ul>
      </section>
      <section>
        <h3>
          Formulas<span className="latin">Grammatica</span>
        </h3>
        <table className="codex-table">
          <tbody>
            <tr>
              <td>
                <code>3d6 + 2</code>
              </td>
              <td>The sum of three d6, plus 2</td>
            </tr>
            <tr>
              <td>
                <code>1d20 + 1d4 − 1</code>
              </td>
              <td>Mix any groups of dice and numbers</td>
            </tr>
            <tr>
              <td>
                <code>2d20kh1</code> / <code>2d20kl1</code>
              </td>
              <td>Keep the highest / lowest one (advantage / disadvantage)</td>
            </tr>
            <tr>
              <td>
                <code>4d6dl1</code>
              </td>
              <td>Drop the lowest one (same as 4d6kh3)</td>
            </tr>
            <tr>
              <td>
                <code>1d100</code> or <code>d%</code>
              </td>
              <td>Percentile: a tens die (00–90) plus a units die (0–9); 00 + 0 counts as 100</td>
            </tr>
          </tbody>
        </table>
        <p className="codex-p">Available dice: d4, d6, d8, d10, d12, d20, d100. A d10 rolled on its own counts its “0” face as 10. Up to 36 dice at once.</p>
      </section>
      <section>
        <h3>
          CoC checks<span className="latin">Probatio</span>
        </h3>
        <p className="codex-p">
          Following <i>Call of Cthulhu</i> 7th edition: roll 1d100; at or under the skill value is a success, at or under half is a <b>hard success</b>, at or under a fifth is an <b>extreme success</b>, and 01 is a <b>critical</b>. With a skill below 50, 96–100 is a <b>fumble</b>; otherwise only 100 is.
        </p>
        <p className="codex-p">
          <b>Bonus</b> and <b>penalty dice</b> really throw extra tens dice: a bonus keeps the lowest tens, a penalty the highest, and the two cancel each other out.
        </p>
      </section>
      <section>
        <h3>
          Fairness<span className="latin">De Aequitate</span>
        </h3>
        <div className="fair">
          {FAIR_ICONS}
          <ul className="codex-list">
            <li>Every die is built from the exact vertices of its polyhedron; the collision shape and the visible shape share the same faces.</li>
            <li>
              Mass is integrated for <b>uniform density</b>: the centre of mass sits exactly at the geometric centre and the inertia is computed for the true shape — <b>no loaded dice</b>.
            </li>
            <li>Results are never decided in advance. Starting position, orientation, velocity and spin come from the browser's cryptographic random source; after that it is all gravity, collisions, friction and bounce.</li>
            <li>If a die ends up leaning on a wall or another die, it gets a tiny push so it falls one way or the other, as physics decides.</li>
            <li>Materials differ in density (brass is heavy, amber light), but each die is uniform throughout.</li>
          </ul>
        </div>
      </section>
      <section>
        <h3>
          Keys &amp; mouse<span className="latin">Claves</span>
        </h3>
        <div className="keys">
          <span>
            <kbd>Space</kbd> roll
          </span>
          <span>
            <kbd>Esc</kbd> close a dialog
          </span>
          <span>
            <kbd>Enter</kbd> roll from the formula field
          </span>
          <span>
            <kbd>Wheel</kbd> zoom
          </span>
          <span>
            <kbd>Middle-drag</kbd> rotate
          </span>
          <span>
            <kbd>Right-drag</kbd> pan
          </span>
        </div>
      </section>
    </div>
  );
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t.help.title} wide>
      {lang === 'en' ? <HelpEn /> : <HelpZh />}
    </Modal>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  latin,
  body,
  confirmText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  latin?: string;
  body: string;
  confirmText: string;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      latin={latin}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t.confirm.cancel}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="confirm-body">{body}</p>
    </Modal>
  );
}
