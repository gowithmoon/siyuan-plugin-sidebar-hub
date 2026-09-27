# Changelog

## 1.0.1 - 2026-09-27

- 新增页面右键菜单，支持重命名、查看属性和删除文档，并遵守只读模式限制。
- 页面重命名、删除和同笔记本移动后局部更新列表，减少重复扫描。
- 数据库列表分批加载当前接口可导航范围内的全部数据库，新增创建时间与修改时间排序，并修复创建时间排序稳定性。
- 页面、数据库和标签采用虚拟列表或虚拟树，仅渲染视口附近的条目，同时保留完整搜索和排序。
- 页面引用数量与数据库记录总数按可见范围加载并缓存，减少离屏请求，并修复刷新期间的数据库计数并发控制。
- 刷新期间保留已有列表，页面首次扫描完成后统一呈现结果，并在刷新后恢复附近的滚动位置。
- 修复虚拟视口测量引发的 Svelte 响应式循环，避免页面扫描与标签页切换冻结。

## 1.0.0 - 2026-09-26

- Add a unified desktop Dock for daily notes, bookmarks, tags, databases, and regular pages.
- Add a compact daily-note calendar with direct year and month selection, existing-note markers, adjacent-note navigation, and confirmed creation of today's note.
- Add collapsible bookmark groups and nested tag navigation with persisted expansion state.
- Add independent search, sorting, refresh, loading, empty, and error states for every navigation source.
- Add asynchronous bookmark, tag, database-record, and page-reference counts without blocking list rendering.
- Add a configurable daily-note notebook and tab visibility while always preserving at least one visible tab.
- Persist the active tab, source sorting, bookmark groups, and collapsed tag paths.
- Refresh affected navigation sources in response to relevant SiYuan notebook and document events.
- Add light and dark theme support, keyboard navigation, and assistive-technology semantics.
