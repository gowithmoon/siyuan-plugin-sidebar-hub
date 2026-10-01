# Changelog

## 1.1.2 - 2026-10-01

- 打开侧边栏中枢后，在后台预加载已启用的书签、标签、数据库和页面标签页，减少首次切换标签页时的等待。

## 1.1.1 - 2026-09-29

- 新增页面筛选：默认排除日记文档及包含日记后代的祖先文档，并可在页面工具栏中按一个或多个已打开笔记本筛选；筛选结果会持久化，已关闭笔记本会自动清理。
- 在书签、标签、数据库和页面标签页的未搜索状态下显示实际导航总数；输入搜索关键词后隐藏该提示，避免与搜索结果数量混淆。
- 统一日记与页面的笔记本、文档扫描逻辑，并同步页面笔记本筛选菜单的选中状态。

## 1.1.0 - 2026-09-28

> v1.0.2 已紧急撤回，原计划内容与后续修复合并到本版本发布。

- 新增书签条目菜单：文档书签支持重命名、查看属性、移除书签和删除文档，内容块书签支持查看属性和移除书签，并遵守只读模式限制。
- 新增书签分组菜单，支持重命名分组或在确认后移除整个分组。
- 支持将思源中的文档、内容块或页签拖入书签分组以更新书签归属；拖到书签空白区域时使用思源默认书签值。
- 原生入口创建日记后立即刷新当前月份，点击日期或“今天”可直接打开新日记，不再误触发重复创建流程。
- 删除日记文档后按文档 ID 更新日历缓存，避免日历继续显示已删除日记或并发扫描写回过期结果。
- 对齐思源原生侧栏交互：调整更多按钮与计数顺序，避免更多按钮提示遮挡菜单，紧凑排列日历导航，并移除重复的面板内最小化按钮。
- 合并文档保存触发的页面刷新，避免连续保存导致重复刷新。

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
