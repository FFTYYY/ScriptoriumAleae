# ScriptoriumAleae · 骰子书房

三维物理掷骰网页。d4 / d6 / d8 / d10 / d12 / d20 / d%，支持 D&D 表达式与 CoC 7e 检定。

在线版本：推送到 GitHub 后由 GitHub Pages 自动发布，地址为 `https://<你的用户名>.github.io/ScriptoriumAleae/`。

## 本地开发

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173，改代码即时刷新
npm run build      # 类型检查并构建到 dist/
npm run preview    # 本地预览构建结果
```

需要支持 WebGL2 的浏览器。构建结果需要通过网页服务器访问；直接双击 `dist/index.html` 时，浏览器会拦截其中的模块脚本。

## 部署到 GitHub Pages

仓库已包含 `.github/workflows/deploy.yml`：每次推送到 `main` 分支，GitHub 会自动构建并发布。

首次使用只需一步：仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。之后在仓库的 Actions 页能看到每次发布的进度。

## 结构

| 路径 | 内容 |
| --- | --- |
| `index.html` | 入口 |
| `src/engine/dice.ts` | 多面体生成（凸包）、圆角网格、数字贴图、均匀密度的体积与转动惯量、读数 |
| `src/engine/DiceTable.ts` | three.js 场景、cannon-es 物理世界、投掷 / 手持、静止判定、镜头、后期 |
| `src/engine/materials.ts` | 骰面着色器（物体空间程序化纹理）与 14 套固定样式 |
| `src/engine/stylegen.ts` | 随机生成每颗骰子的配色与材质，按亮度对比度挑选数字颜色 |
| `src/engine/scenery.ts` · `textures.ts` | 骰盘、毛毡、烛台、书本、羊皮纸等，全部程序化生成 |
| `src/engine/audio.ts` | 按碰撞冲量实时合成的音效 |
| `src/logic/roll.ts` | 表达式解析、掷骰计划、结果与 CoC 成功等级 |
| `src/ui/*` | 自绘组件：滚动条、弹窗、步进器、滑块、开关、分段选择 |

## 关于公平

- 点数从不预设：初始位置、朝向、速度、角速度取自 `crypto.getRandomValues`，之后完全由物理决定。
- 质心位于几何中心；转动惯量按均匀密度对多面体精确积分（替代 cannon-es 默认的包围盒近似）。
- 骰子斜靠未放平时，只对该骰施加一次轻微冲量，让它按物理规律倒向一侧。

## 视角

骰子停下后：滚轮缩放，中键拖动旋转，右键拖动平移（触屏：双指捏合缩放、拖动旋转）。
