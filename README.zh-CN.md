# 侧边抽屉

[English](./README.md)

“侧边抽屉”是一个思源笔记桌面端插件，通过一个左侧 Dock 聚合日记、书签、标签、数据库和普通页面导航，同时保留思源官方侧边栏面板。

当前仓库正在按 [GitHub Issues](https://github.com/gowithmoon/siyuan-plugin-sidebar-hub/issues) 逐步实现。现阶段已经提供：

- 位于左侧上半区的单一 Dock 入口；
- 紧凑月历骨架，以及内嵌在月历标题栏的“今天”按钮；
- 固定顺序的书签、标签、数据库、页面标签页；
- 标签页显隐设置，并保证至少保留一个标签页；
- 当前标签页和显隐设置的持久化。

书签、标签、数据库、页面与日记的实际数据和打开行为将在后续 Issues 中接入。

## 开发

需要 Node.js 24 或更高版本，以及 pnpm 11.4。

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

提交或交付前运行：

```bash
pnpm run check
pnpm run build
```

## 快速部署到本地工作空间

复制本地环境变量示例，并将 `SIYUAN_PLUGINS_DIR` 设置为思源工作空间的 `data/plugins` 绝对路径：

```bash
cp .env.example .env.local
pnpm run release
```

例如：

```dotenv
SIYUAN_PLUGINS_DIR=/home/user/SiYuan/data/plugins
```

`pnpm run release` 会构建插件，并将 `dist/` 复制到：

```text
<SIYUAN_PLUGINS_DIR>/siyuan-plugin-sidebar-hub/
```

系统环境变量优先于 `.env.local`。`.env.local` 已被 Git 忽略，不要提交个人工作空间路径。

## 构建安装包

```bash
pnpm run make-install
```

生产构建会生成 `dist/` 和 `package.zip`。这些文件是构建产物，不应手工修改或提交。

## 运行范围

首版只面向桌面端、桌面浏览器和桌面独立窗口，不提供移动端专用交互，也不包含 Kernel Plugin。

## 许可

[MIT](./LICENSE)
