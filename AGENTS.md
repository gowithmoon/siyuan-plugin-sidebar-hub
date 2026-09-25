# Repository Guidelines

## 项目结构与模块组织

`src/` 包含插件源码：`src/libs/` 放置可复用组件与库，`src/types/` 放置共享类型，`src/kernel-capture/` 放置内核侧捕获逻辑。`scripts/` 存放清理、构建辅助、开发链接和安装脚本；`plugin.json`、`vite.config.ts`、`svelte.config.js` 与 TypeScript 配置位于仓库根目录。`dist/`、`dev/`、`kernel.js` 和 `package.zip` 等构建产物不要手工修改或提交。

领域术语和项目边界以 `CONTEXT.md` 及相关 ADR 为准；修改跨模块行为前先阅读对应文档和实现。

## 构建、检查与开发

- `pnpm install --frozen-lockfile`：按锁文件安装依赖。
- `pnpm run dev`：同时启动前端和内核的监听构建。
- `pnpm run check`：运行 TypeScript 与 Svelte 检查。
- `pnpm run build`：清理并生成前端、内核生产构建。
- `pnpm run make-install`：构建并生成可安装插件包。

提交或交付前至少运行 `pnpm run check`；涉及发布产物时再运行 `pnpm run build` 或 `pnpm run make-install`。

## 编码风格与命名

沿用仓库现有格式和 Prettier 配置。TypeScript、Svelte 组件、类和类型使用 `PascalCase`，函数与变量使用 `camelCase`；文件名优先使用现有目录中的命名风格。修改界面时保持现有 Svelte 组件结构、主题变量和国际化约定，不要提交个人路径、令牌或生成物。

## Agent 工作流

不要覆盖用户已有的未提交改动。开始涉及领域概念或架构决策的工作前，阅读 `CONTEXT.md` 和相关 `docs/adr/`；完成重要领域决策后按需补充这些文档。涉及思源笔记插件功能新需求开发或设计，需要参考`../vendor/siyuan`（思源笔记源代码）和`../vendor/petal`（思源笔记前端API）。

## Agent skills

### Issue tracker

问题与规格通过 GitHub Issues 管理。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用默认标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human` 和 `wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

采用单上下文领域文档布局。详见 `docs/agents/domain.md`。
