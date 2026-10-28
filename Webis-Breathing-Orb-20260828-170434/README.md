# Webis 不规则点阵呼吸动效 · 独立备份

保存日期：2026-08-28。此包保存的是当时 Webis 工作目录中的实际代码，包括尚未提交的动效修改，不依赖未来的 Git 版本。

## 这是哪一个版本

这是用户确认采用的 Breathing 动效：多层点阵环的轮廓连续起伏、收放，而不是标准圆形旋转，也不是固定三角形。Home 和 Console 共用相同算法，仅显示尺寸不同。

- 参考入口：https://orbs.jakubantalik.com/
- 原始算法：thinking-orbs 的 Breathing / 64px preset。
- 上游固定版本：`c8f7d5ae1cd31f77ed9b4039d276f27ce201bbb3`。
- 上游源码：https://github.com/Jakubantalik/Libraries/tree/c8f7d5ae1cd31f77ed9b4039d276f27ce201bbb3/packages/thinking-orbs
- 原作者 Jakub Antalik，MIT 许可；完整许可保留在 `src/breathingOrb.ts` 顶部，复制、分发时不要移除。

## 文件说明

- `src/breathingOrb.ts`：独立、无 React 依赖的几何算法与 Canvas 绘制函数。
- `src/StudioIntentLoader.tsx`：React 包装，包含动画时钟、离屏暂停、隐藏标签页暂停、减少动态效果设置及清理逻辑。
- `src/studio-intent-loader.css`：动效样式，颜色来自共享 Token。
- `src/breathingOrb.test.ts`：原始算法数值与点阵层次测试。
- `src/StudioIntentLoader.test.tsx`：Canvas 尺寸、暂停恢复和生命周期测试。
- `reference/WEBIS_DESIGN_TOKENS.css`：归档时的全局 Token 快照，仅供查阅，不要整份覆盖其他项目的设计规范。
- `reference/package.json`：原项目依赖版本说明，仅供查阅，不要覆盖个人网站的 package.json。
- `preview/webis-breathing-preview.gif`：实际组件渲染出的循环预览；下方的大图为放大细节，并非正式界面的尺寸。
- `SHA256SUMS.json`：包内各文件校验值，用于检查归档是否被修改。

## 恢复到 Webis

先备份目标项目的当前文件，再将 `src/` 下五个文件复制到：

```text
src/homepage/domains/01-studio/intent-routing/
```

三个运行时文件必须保持同级。原有调用方式：

```tsx
import { StudioIntentLoader } from "./StudioIntentLoader";

// Home：19px
<StudioIntentLoader active={working} />

// Console：48px，工作或学习状态期间显示
<StudioIntentLoader active size={48} />
```

`active={false}` 会保留静态图形，并不会隐藏组件。任务完成后是否隐藏，由调用方决定。这个备份只包含动效，不包含业务状态判定或 Gateway API；不要让动效自行推断 Agent 是否工作。

## 在其他项目使用

React 包装需要 React 和 TypeScript/TSX 构建环境；原项目使用 React 19，测试使用 Vitest 与 happy-dom。该动画不需要额外安装 thinking-orbs、Three.js 或网络服务。

宿主项目需提供颜色 Token：

```css
--webis-accent-text: #8e9b4f;
```

Webis 项目中继续使用现有共享 Token，不要重复定义。普通 HTML 网页不能直接引用 `.tsx`：可以将 `breathingOrb.ts` 编译成 JavaScript 后调用 Canvas 绘制函数，也可以在 React 项目中直接使用包装组件。

## 不要遗失的动效参数

- 几何基准尺寸：64；实际显示尺寸通过 Canvas 缩放保持统一形态。
- 速度系数：3.24；动画时间为 `performance.now() / 1000 * 3.24`。
- 点阵结构：11 层 × 44 段，共 484 个粒子。
- 波动幅度：0.368；两组行波及各层相位差共同形成变化轮廓。
- 不使用整体自转，不切换三角形/方形，不替换成单层 CSS 短线旋转。
- 颜色：Webis 深绿 `#8e9b4f`；深度通过粒子大小和透明度表达。
- 低动态偏好：固定绘制 time=0.6；后台/离屏暂停动画。

## 归档前验证记录

- 与固定版本原始算法在 7 个时间点比较，每帧全部 484 个粒子的坐标、半径与层次参数一致（浮点容差 1e-10）。
- 独立组件的中英文、桌面、窄屏和低高度共 40 项显示检查通过。
- 减少动态效果、inactive 静止及终态隐藏检查通过。
- 原项目类型检查、998 项测试及生产构建通过。这是归档时的验证记录，不代表在未来项目环境中自动通过；恢复后应重新执行目标项目的检查。

此目录和同名 ZIP 是个人留档，不会自动修改或接入个人网站现有页面。建议保留 ZIP 不动，后续修改另存新版本。
