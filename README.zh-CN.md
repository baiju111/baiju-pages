# PIXEL STUDIO

**378 个方块，一张画布，零运行时依赖。**

一张真实图像被拆成 378 个实测方块，再在浏览器里重新归位。没有 React，没有框架，没有构建步骤。

[English README](README.md) ·
[GitHub](https://github.com/baju111/baiju-pages) ·
[在线演示](https://baju111.github.io/baiju-pages/) ·
[运行方式](#本地运行) ·
[工作原理](#工作原理)

[![Live demo](https://img.shields.io/badge/demo-live-F26A35?style=flat-square)](https://baju111.github.io/baiju-pages/)
![Runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-191919?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-191919?style=flat-square)
[![Syntax check](https://github.com/baju111/baiju-pages/actions/workflows/check.yml/badge.svg)](https://github.com/baju111/baiju-pages/actions/workflows/check.yml)

![PIXEL STUDIO — 378 个方块，一张画布](docs/media/hero.gif)

## 这是什么

PIXEL STUDIO 是一个关于“解构与归位”的单页实验。源图 B 被读取为 378 个真实的 4-连通方块；每个方块的实测中心、颜色和描边标记成为动画的固定目标。页面依次播放苏醒、汇聚、轮廓、局部重组、精准归位五个阶段，最后交给透明母版。

作品区是一个独立的原生 `<circular-carousel>` 自定义元素：3D 圆柱、拖动旋转、松手吸附、键盘导航、卡片翻面，以及减少动态模式。它不是 React 组件，也没有使用 React Bits 的源代码。

![作品轮播](docs/media/carousel.png)

## 工作原理

```text
B（1672×941 JPEG）
  → 亮度阈值 < 190
  → 378 个 4-连通前景方块
  → 实测中心、尺寸、颜色、描边标记
  → 透明母版 + 方块数据
  → Canvas 2D 五阶段时间线
  → 最终 <img> 接管
```

几个关键点：

- B 不是完美网格。方块中心有轻微漂移，所以网站保留每个方块的实测中心，而不是强行吸附到理想网格。
- B 是白底 JPEG，没有原始 Alpha。透明母版是从白底反遮罩重建的，不是恢复原始透明通道。
- 最终 PNG 为 824×928；方块之间的透明缝隙是画面的一部分，不是 CSS 网格。
- Canvas 是动画层；动画结束后，透明 PNG 接管最终画面。
- 作品轮播与首屏互相独立。六张 1:1 卡片会先居中再翻面，而不是在偏轴位置直接翻转。

## 本地运行

网站没有运行时依赖，也没有构建步骤。

```powershell
python -m http.server 8765
```

打开 [http://127.0.0.1:8765/](http://127.0.0.1:8765/)。

直接双击 `index.html` 在当前 Chrome 中也能运行，但本地 HTTP 服务可以避免 `file://` 的字体加载警告，推荐用这种方式预览。

GitHub Pages、Netlify、Vercel 或任何静态主机都可以直接托管这个文件夹。查看网站不需要 Node、PHP 或任何服务端运行时。

## 操作方式

**首屏**

- 点击 / 轻触画面：从头重播。
- 画面聚焦时按 `Enter`：重播。
- 画面聚焦时按 `Space`：暂停 / 继续。
- 鼠标移动或触摸按住：扰动局部方块，松开后归位。
- 强度固定为“中”；没有可见的控制条。

**作品轮播**

- 空闲且进入视口时自动旋转，14 秒一圈。
- 悬停、键盘聚焦、触摸、拖动、翻面时暂停。
- 拖动超过 5px 开始旋转，松手后吸附到最近一张。
- 点击卡片：先居中，再翻面；再点一次或按 `Esc` 翻回。
- 方向键切换；`Home` / `End` 跳到首尾；`Enter` / `Space` 翻转当前卡片。
- 编号 01–06 可以直接跳转。
- 桌面显示左右箭头；≤960px 隐藏箭头，保留拖动、编号和键盘。
- 减少动态模式会关闭自动旋转、入场动画和惯性。

## 项目结构

```text
index.html
css/
  site.css
  components/circular-carousel.css
js/
  main.js
  logo-data.js
  works.js
  components/circular-carousel.js
assets/
  logo-mark.png
  logo-data.json
  source/logo-b.jpg
  works/study-01.svg … study-06.svg
  fonts/*.ttf
scripts/
  extract_logo.py
  make_studies.py
tests/
docs/media/
```

## 自定义

**作品**

替换 `assets/works/` 里的 SVG，或修改 `js/works.js` 指向新图片。卡片是 1:1，使用 `object-fit: cover`，请让主体居中，并允许边缘裁切。每条数据需要 `src`、`alt`、`title`、`subtitle`。

**首屏**

首屏由一张源图生成，不是逐块手写：

1. 替换 `assets/source/logo-b.jpg`。
2. 运行 `python scripts/extract_logo.py`（需要 Python、NumPy、Pillow）。
3. 提交重新生成的 `assets/logo-mark.png`、`assets/logo-data.json` 和 `js/logo-data.js`。

如果新图的方块数量或画布尺寸变了，还要同步修改 `378 CELLS` 文案、图片尺寸、alt 文案和验收测试。引擎读取的是 `cells` 数组，但页面文案会明确写出当前作品的具体数字。

当前提取器适合“白底或透明背景、深色、彼此分离的方块”。普通 logo 的连续笔画或照片不会得到同样的结构，需要另一套像素化模式。

## 无障碍与性能

- 使用原生按钮、链接和可聚焦画面，没有纯 div 控件。
- 首屏阶段通过隐藏的 live region 播报。
- 轮播有隐藏状态区，并支持键盘。
- `prefers-reduced-motion: reduce` 会切换到静态/有限动态路径。
- JavaScript 失败时，静态图和作品文字列表仍然保留。
- 在 1440、768、390px 三档宽度下无横向溢出。
- 每帧约 378 次 `fillRect`；设备像素比上限为 2。
- 所有资源都在本地：没有外部字体、图片、统计脚本或 API。

<p>
  <img src="docs/media/mobile.png" width="280" alt="PIXEL STUDIO 在 390px 移动端的样子">
</p>

已知取舍：轮播默认自动旋转，但没有可见的暂停按钮。它在悬停、聚焦、触摸、拖动和翻面时会暂停。如果你的使用场景要求 WCAG 2.2.2，建议增加可见的暂停控件，或默认不自动旋转。

## 测试

先启动本地服务，然后逐个运行：

```powershell
node tests/browser_test.mjs
node tests/resilience_test.mjs
node tests/keyboard_test.mjs
node tests/carousel_test.mjs
```

测试使用本机 Chrome 的 CDP，不需要 Playwright 或 npm 包。查看网站本身不需要运行测试。完整测试记录和已知限制见 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 授权

- 代码：[MIT](LICENSE)。
- 源图 B、`logo-mark.png` 和六个作品 SVG：© 2026 PIXEL STUDIO，**不包含在 MIT 授权内**。见 [CREDITS.md](CREDITS.md)。
- Bricolage Grotesque 与 Silkscreen 以 SIL Open Font License 1.1 自托管；授权文件在 `assets/fonts/`。
- 环形轮播交互参考了 [React Bits Circular Carousel](https://reactbits.dev/components/circular-carousel)，但没有复制其源代码，也没有引入 React。

如果这个项目对你有启发或帮助，点一个 star 可以让更多人看到它。
