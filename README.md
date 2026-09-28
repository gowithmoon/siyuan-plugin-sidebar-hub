<p align="center">
  <img src="./icon.png" width="128" height="128" alt="Sidebar Hub icon">
</p>
<p align="center">
  <img src="./preview.png" alt="Sidebar Hub preview">
</p>

# Sidebar Hub

[简体中文](./README.zh-CN.md)

Sidebar Hub brings daily notes, bookmarks, tags, databases, and regular pages together in one compact SiYuan Dock. It provides a faster navigation entry without replacing SiYuan's built-in sidebar panels.

## Features

### Daily-note calendar

- Marks existing daily notes in a compact monthly calendar.
- Opens an existing daily note by selecting its date.
- Lets you jump directly to a year or month and return to today.
- Moves to the nearest previous or next existing daily note, skipping dates without notes.
- Creates today's missing daily note through SiYuan's native flow after confirmation.

The calendar uses one notebook selected in the plugin settings. That notebook must be open and have a daily-note save path configured in SiYuan. Missing past or future daily notes are never created.

### Unified navigation tabs

- **Bookmarks:** grouped by bookmark value, with collapsible groups and group counts. Rename or remove groups, manage bookmarked documents and blocks from their context menus, and drag SiYuan documents, blocks, or tabs into a group to change their bookmark assignment. Sort by name, creation time, or modification time.
- **Tags:** displayed as a collapsible tree with exact reference counts. Virtual parent tags organize descendants but do not open a search result of their own. Sort by name or reference count.
- **Databases:** lists attribute views, shows their total record counts, and opens the database block with a document fallback. Sort by name.
- **Pages:** scans every open notebook for regular documents, excluding daily notes and their path ancestors. Shows document reference counts and sorts by name, creation time, or modification time.

Each tab has independent search, sorting, refresh, loading, empty, and error states. Searches accept multiple keywords. Counts that require extra queries are filled in asynchronously so the list can appear first.

### Preferences and accessibility

- Show or hide individual tabs while always keeping at least one visible.
- Persists the active tab, sorting choices, bookmark groups, and collapsed tag paths.
- Refreshes affected sources when relevant notebook or document changes are received from SiYuan.
- Supports SiYuan's light and dark themes.
- Provides keyboard access and assistive-technology semantics for tabs, dates, menus, tools, and entries.

## Requirements

- SiYuan `3.8.0` or later.
- A desktop, desktop browser, or detached desktop-window frontend.

Mobile frontends and Kernel Plugins are not supported. Sidebar Hub is also disabled in SiYuan's publishing service because its navigation depends on private workspace data and desktop Dock interaction.

## Installation

### SiYuan marketplace

Open **Settings → Marketplace → Plugins**, search for **Sidebar Hub**, install it, and enable it in **Downloaded**.

### Manual installation

1. Download `package.zip` from the latest [GitHub Release](https://github.com/gowithmoon/siyuan-plugin-sidebar-hub/releases/latest).
2. Extract it to `<workspace>/data/plugins/siyuan-plugin-sidebar-hub/` so that `plugin.json` is directly inside that directory.
3. Restart SiYuan or reload plugins, then enable **Sidebar Hub**.

## Getting started

1. Enable the plugin and open its grid icon in the upper-left Dock.
2. Open the plugin settings and select the notebook used for daily notes.
3. Use the calendar to open daily notes, or switch among the bookmark, tag, database, and page tabs.
4. Use each tab's toolbar to search, sort, refresh, and expand or collapse supported groups. In the bookmark tab, use an entry or group context menu to manage bookmarks, or drag SiYuan documents, blocks, and tabs into a bookmark group.

On very large workspaces, the first page scan and asynchronous counts may take a little longer. A loading indicator or `…` count means the result has not been confirmed yet; it does not mean zero.

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

### Deploy to a local workspace

Copy the environment example and set `SIYUAN_PLUGINS_DIR` to the absolute `data/plugins` path of your SiYuan workspace:

```bash
cp .env.example .env.local
pnpm run release
```

For example:

```dotenv
SIYUAN_PLUGINS_DIR=/home/user/SiYuan/data/plugins
```

The system environment variable takes precedence over `.env.local`. The local file is ignored by Git and must not contain committed personal paths.

### Build an installable package

```bash
pnpm run make-install
```

Production builds generate `dist/` and `package.zip`. They are generated artifacts and should not be edited or committed.

## Privacy

Sidebar Hub reads navigation data from the current SiYuan workspace through SiYuan's local APIs. It does not send workspace content to an external service and does not include telemetry.

## License

[MIT](./LICENSE)
