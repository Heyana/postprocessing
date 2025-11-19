# 仓库指南

## 项目结构与模块组织
- `src/` 存放运行时模块（核心、效果、通道、加载器、着色器、工具）。将新功能放置在其运行时对应部分旁边，并将 GLSL 辅助文件放在 `effects/glsl` 下。
- `test/` 镜像 `src/` 目录结构（例如，`src/effects/BloomEffect.js` ⇔ `test/effects/BloomEffect.js`）。保持测试夹具（fixtures）轻量级并靠近它们服务的规范。
- `demo/` 和 `manual/` 为 Hugo 文档站点提供支持；它们的编译输出位于 `public/` 中。仅编辑源文件，让脚本刷新生成的资源。
- `docs/` 记录设计说明，`libs/` 和 `types/` 提供共享助手，而 `build/` 和 `temp/` 是脚本输出，应在提交前清理。

## 构建、测试与开发命令
- `npm run build` = 清理 → 通过 Sass 处理 CSS → 通过 esbuild 处理 JS 包（生产和压缩版） → TypeScript 声明。
- `npm run watch` 启动 `watch:css`、`watch:js` 和 `start` 以热重载演示。
- `npm run start` 在 http://localhost:1313 服务 `manual/`；`npm run copy` 将演示静态资源同步到 `public/demo`。
- `npm run lint`（或特定范围的 `lint:js`、`lint:css`、`lint:dts`）必须在开启 PR 之前通过；`npm run test` 镜像 CI 管道（lint → build → ava → esdoc）。

## 代码风格与命名规范
- 源文件是带有 TypeScript 友好 JSDoc 的 ES 模块。保留硬制表符进行缩进，120 字符软换行，以及驼峰式命名标识符（`AdaptiveSharpenEffect`）。
- 导出名称应与文件名匹配；坚持使用 `*Effect`、`*Pass`、`*Material` 等。保持着色器文件名后缀为 `.frag`/`.vert` 并与其效果放在一起。
- 通过提供的脚本运行 `eslint`、`stylelint` 和 `tsc`——不鼓励手动更改格式。

## 测试指南
- AVA 扫描 `test/**/*`；每当您修改 `src` 时，请添加一个规范。镜像目录深度，以便审阅者可以轻松比较运行时/测试对。
- 倾向于使用描述性的测试标题并覆盖边缘情况（多渲染目标、深度纹理、计时器）。在运行完整套件之前，使用 `npm run ava` 进行重点运行。
- 视觉功能需要手动检查：运行 `npm run watch`，打开相关演示，并截取屏幕截图以检查回归。

## 提交与 Pull Request 指南
- 从 `dev` 分支创建分支，变基到最新的 `dev`，并保持提交范围明确。常规前缀（`feat:`、`fix:`、`chore:`）与现有历史记录保持一致。
- 每个 PR 必须注明运行的测试（`npm run test`，手动演示 URL）并链接相关问题。当功能影响文档/手册时，包括文档/手册更新和资源。
- 永远不要提交生成的包或本地机密（`auth.json`、`.npmrc`）。在推送之前使用 `npm run clean` 以确保差异仅包含源更改。
