# Sidebar Hub

[中文版](./README.zh-CN.md)

Sidebar Hub is a desktop SiYuan plugin that brings daily notes, bookmarks, tags, databases, and regular pages into one left-side Dock while keeping SiYuan's built-in sidebar panels available.

The first release includes:

- one Dock entry in the upper-left area;
- a compact calendar that marks and opens existing daily notes, with the Today action inside its header;
- bookmarks, tags, databases, and pages tabs in a fixed order;
- searchable, sortable, and refreshable bookmark, tag, and database lists;
- a regular-page list that scans open notebooks while excluding daily notes and their path ancestors;
- a single daily-note notebook setting and confirmed creation of today's note through SiYuan's native API;
- tab visibility settings that always keep at least one tab visible;
- persisted active-tab, visibility, and per-tab sorting preferences;
- light and dark theme support plus keyboard access to tabs, dates, tools, and entries.

Missing daily notes for today can be created through SiYuan's native flow after confirmation. Missing past or future daily notes are not created.

## Development

Node.js 24 or later and pnpm 11.4 are required.

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

Before handing off changes, run:

```bash
pnpm run check
pnpm test
pnpm run build
```

## Quick deployment to a local workspace

Copy the environment example and set `SIYUAN_PLUGINS_DIR` to the absolute `data/plugins` path of your SiYuan workspace:

```bash
cp .env.example .env.local
pnpm run release
```

For example:

```dotenv
SIYUAN_PLUGINS_DIR=/home/user/SiYuan/data/plugins
```

`pnpm run release` builds the plugin and copies `dist/` to:

```text
<SIYUAN_PLUGINS_DIR>/siyuan-plugin-sidebar-hub/
```

The system environment variable takes precedence over `.env.local`. The local file is ignored by Git and must not contain committed personal paths.

## Build an installable package

```bash
pnpm run make-install
```

Production builds generate `dist/` and `package.zip`. They are generated artifacts and should not be edited or committed.

## Supported runtime

The first release targets desktop, browser desktop, and desktop window frontends. It does not include mobile-specific interaction or a Kernel Plugin.

## License

[MIT](./LICENSE)
