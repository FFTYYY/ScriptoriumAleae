import type { TableSettings } from '../engine/DiceTable';
import { DICE_STYLES } from '../engine/materials';
import { FELT_COLORS } from '../engine/scenery';
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
  const current = settings.styleId;
  return (
    <Modal open={open} onClose={onClose} title="设置" wide>
      <section className="set-section">
        <h3>
          骰子样式<span className="latin">Ornatus</span>
        </h3>
        <p className="set-desc">默认“随机生成”：每颗骰子的配色、花纹和材质都由程序当场生成，数字颜色按对比度自动挑选。也可以选一种固定样式让整组统一。</p>
        <div className="style-grid" role="radiogroup" aria-label="骰子样式">
          <button role="radio" aria-checked={current === 'random'} className={`style-tile ${current === 'random' ? 'on' : ''}`} onClick={() => onChange({ styleId: 'random' })}>
            <span className="style-swatch swatch-random" />
            <span className="style-name">随机生成</span>
            <span className="style-latin">Varietas</span>
            <span className="style-blurb">颜色、花纹、材质全部随机，每颗都不一样</span>
          </button>
          {DICE_STYLES.map((s) => (
            <button key={s.id} role="radio" aria-checked={current === s.id} className={`style-tile ${current === s.id ? 'on' : ''}`} onClick={() => onChange({ styleId: s.id })}>
              <span className="style-swatch" style={{ background: s.swatch }} />
              <span className="style-name">{s.name}</span>
              <span className="style-latin">{s.latin}</span>
              <span className="style-blurb">{s.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="set-section">
        <h3>
          桌布<span className="latin">Pannus</span>
        </h3>
        <div className="felt-row" role="radiogroup" aria-label="桌布颜色">
          {Object.entries(FELT_COLORS).map(([id, f]) => (
            <button key={id} role="radio" aria-checked={settings.felt === id} className={`felt-dot ${settings.felt === id ? 'on' : ''}`} onClick={() => onChange({ felt: id })}>
              <span style={{ background: `radial-gradient(circle at 35% 30%, ${f.sheen}, ${f.color} 60%)` }} />
              <em>{f.name}</em>
            </button>
          ))}
        </div>
      </section>

      <div className="set-grid">
        <section className="set-section">
          <h3>
            播放速度<span className="latin">Tempus</span>
          </h3>
          <Segmented
            label="播放速度"
            value={settings.timeScale}
            onChange={(v) => onChange({ timeScale: v })}
            options={[
              { value: 0.15, label: '0.15×' },
              { value: 0.35, label: '0.35× 默认' },
              { value: 0.5, label: '0.5×' },
              { value: 1, label: '1× 真实' },
            ]}
          />
          <p className="set-desc">默认放慢到 0.35 倍，便于看清翻滚过程；1× 是真实速度。只改变播放速度，物理过程不变。</p>
        </section>
        <section className="set-section">
          <h3>
            画质<span className="latin">Claritas</span>
          </h3>
          <Segmented
            label="画质"
            value={settings.quality}
            onChange={(v) => onChange({ quality: v })}
            options={[
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' },
            ]}
          />
          <p className="set-desc">“低”会关闭泛光与抗锯齿。画面卡顿时会自动降低渲染分辨率。</p>
        </section>
        <section className="set-section">
          <h3>
            音效<span className="latin">Sonus</span>
          </h3>
          <div className="sound-row">
            <Toggle checked={settings.sound} onChange={(v) => onChange({ sound: v })} label="音效" />
            <div className={`vol ${settings.sound ? '' : 'is-off'}`}>
              <Slider label="音量" value={Math.round(settings.volume * 100)} min={0} max={100} onChange={(v) => onChange({ volume: v / 100 })} />
              <span className="vol-num">{Math.round(settings.volume * 100)}</span>
            </div>
          </div>
          <p className="set-desc">碰撞声由物理引擎测得的冲量实时合成。</p>
        </section>
      </div>
    </Modal>
  );
}

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="说明" wide>
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
            <div className="fair-icons">
              {(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const).map((k) => (
                <DieIcon key={k} kind={k} width={30} height={30} />
              ))}
            </div>
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      latin={latin}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            取消
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
