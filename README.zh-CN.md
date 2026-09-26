# 侧边抽屉

[English](./README.md)

“侧边抽屉”是一个思源笔记桌面端插件，通过一个左侧 Dock 聚合日记、书签、标签、数据库和普通页面导航，同时保留思源官方侧边栏面板。

当前首版提供：

- 位于左侧上半区的单一 Dock 入口；
- 可标记并打开已有日记的紧凑月历，以及内嵌在标题栏的“今天”按钮；
- 固定顺序的书签、标签、数据库、页面标签页；
- 可搜索、排序、刷新并打开目标的书签、标签和数据库列表；
- 扫描已打开笔记本、排除日记及其路径祖先的普通页面列表；
- 日记笔记本单选设置，以及确认后通过思源官方能力创建今日日记；
- 标签页显隐设置，并保证至少保留一个标签页；
- 当前标签页、显隐和各页排序设置的持久化；
- 亮暗主题适配，以及标签页、日期、工具栏和列表的键盘操作。

缺失的今日日记会在确认后通过思源官方能力创建；缺失的过去或未来日记不会创建。

## 开发

需要 Node.js 24 或更高版本，以及 pnpm 11.4。

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

提交或交付前运行：

```bash
pnpm run check
pnpm test
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
