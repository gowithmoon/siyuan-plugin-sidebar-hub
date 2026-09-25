import { Plugin, Setting, showMessage } from "siyuan";
import { mount, unmount } from "svelte";

import SidebarHub from "./sidebar-hub/sidebar-hub.svelte";
import type { BookmarkSortField } from "./sidebar-hub/bookmarks";
import type { DatabaseSortField } from "./sidebar-hub/databases";
import type { PageSortField } from "./sidebar-hub/pages";
import {
    loadDailyNotebookConfig,
    loadDailyNotebooks,
} from "./sidebar-hub/daily-note-siyuan";
import { loadDailyNotebookOptions, type DailyNotebookOption } from "./sidebar-hub/daily-notes";
import {
    DEFAULT_PREFERENCES,
    TAB_DEFINITIONS,
    normalizePreferences,
    setTabVisibility,
    type SidebarHubPreferences,
    type SidebarTabId,
} from "./sidebar-hub/preferences";
import "./index.scss";

const DOCK_TYPE = "sidebar-hub";
const PREFERENCES_FILE = "preferences.json";

interface SidebarHubHandle {
    updatePreferences: (preferences: SidebarHubPreferences) => void;
}

interface SidebarHubTranslations {
    title: string;
    today: string;
    previousMonth: string;
    nextMonth: string;
    minimize: string;
    createDailyNoteTitle: string;
    createDailyNoteMessage: string;
    dailyNotebookRequired: string;
    dailyNotebookClosed: string;
    dateCreationUnsupported: string;
    dailyNoteLoadError: string;
    dailyNoteOpenError: string;
    dailyNotebook: string;
    dailyNotebookDescription: string;
    noDailyNotebook: string;
    visibleTabsDescription: string;
    keepOneTab: string;
    tabs: Record<SidebarTabId, string>;
    bookmarks: {
        searchPlaceholder: string;
        sortLabel: string;
        sortAscending: string;
        sortDescending: string;
        refresh: string;
        retry: string;
        loading: string;
        empty: string;
        noMatches: string;
        loadError: string;
        openError: string;
        groupLabel: string;
        sortOptions: Record<BookmarkSortField, string>;
    };
    tags: {
        searchPlaceholder: string;
        sortLabel: string;
        sortAscending: string;
        sortDescending: string;
        refresh: string;
        retry: string;
        loading: string;
        empty: string;
        noMatches: string;
        loadError: string;
        openError: string;
        sortOptions: Record<"name" | "count", string>;
    };
    databases: {
        searchPlaceholder: string;
        sortLabel: string;
        sortAscending: string;
        sortDescending: string;
        refresh: string;
        retry: string;
        loading: string;
        empty: string;
        noMatches: string;
        loadError: string;
        openError: string;
        sortOptions: Record<DatabaseSortField, string>;
    };
    pages: {
        searchPlaceholder: string;
        sortLabel: string;
        sortAscending: string;
        sortDescending: string;
        refresh: string;
        retry: string;
        loading: string;
        empty: string;
        noMatches: string;
        loadError: string;
        openError: string;
        progress: string;
        sortOptions: Record<PageSortField, string>;
    };
}

export default class SidebarHubPlugin extends Plugin {
    private preferences: SidebarHubPreferences = DEFAULT_PREFERENCES;
    private readonly dockHandles = new Set<SidebarHubHandle>();
    private readonly visibilityInputs = new Map<SidebarTabId, HTMLInputElement>();
    private dailyNotebookOptions: DailyNotebookOption[] = [];

    async onload() {
        this.preferences = normalizePreferences(await this.loadData(PREFERENCES_FILE));

        const translations = this.i18n.sidebarHub as unknown as SidebarHubTranslations;
        try {
            this.dailyNotebookOptions = await loadDailyNotebookOptions({
                listNotebooks: loadDailyNotebooks,
                getNotebookConfig: loadDailyNotebookConfig,
            });
        } catch {
            this.dailyNotebookOptions = [];
        }
        this.setting = new Setting({});
        this.registerSettings(translations);

        const plugin = this;
        this.addDock({
            config: {
                position: "LeftTop",
                size: { width: 320, height: 0 },
                icon: "iconCalendar",
                title: translations.title,
            },
            data: {},
            type: DOCK_TYPE,
            init() {
                const host = document.createElement("div");
                host.className = "sidebar-hub-host fn__flex-1";
                this.element.appendChild(host);

                const handle = mount(SidebarHub, {
                    target: host,
                    props: {
                        app: plugin.app,
                        preferences: plugin.preferences,
                        translations,
                        instanceId: crypto.randomUUID(),
                        onActiveTabChange: (tabId: SidebarTabId) => plugin.selectTab(tabId),
                    },
                }) as SidebarHubHandle;

                plugin.dockHandles.add(handle);
                this.data.handle = handle;
                this.data.host = host;
            },
            destroy() {
                const handle = this.data.handle as SidebarHubHandle | undefined;
                if (handle) {
                    plugin.dockHandles.delete(handle);
                    unmount(handle);
                }
                (this.data.host as HTMLElement | undefined)?.remove();
            },
        });
    }

    private registerSettings(translations: SidebarHubTranslations) {
        const dailyNotebookSelect = document.createElement("select");
        dailyNotebookSelect.className = "b3-select fn__flex-center";
        dailyNotebookSelect.append(new Option(translations.noDailyNotebook, ""));
        for (const notebook of this.dailyNotebookOptions) {
            dailyNotebookSelect.append(new Option(notebook.name, notebook.id));
        }
        dailyNotebookSelect.value = this.dailyNotebookOptions.some(
            (notebook) => notebook.id === this.preferences.dailyNotebookId,
        ) ? this.preferences.dailyNotebookId : "";
        dailyNotebookSelect.addEventListener("change", () => {
            void this.updatePreferences({
                ...this.preferences,
                dailyNotebookId: dailyNotebookSelect.value,
            });
        });
        this.setting.addItem({
            title: translations.dailyNotebook,
            description: translations.dailyNotebookDescription,
            actionElement: dailyNotebookSelect,
        });

        for (const tab of TAB_DEFINITIONS) {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.className = "b3-switch fn__flex-center";
            input.checked = this.preferences.visibleTabs[tab.id];
            input.addEventListener("change", () => {
                void this.changeTabVisibility(tab.id, input.checked, translations.keepOneTab);
            });

            this.visibilityInputs.set(tab.id, input);
            this.setting.addItem({
                title: translations.tabs[tab.id],
                description: translations.visibleTabsDescription,
                actionElement: input,
            });
        }
    }

    private async changeTabVisibility(tabId: SidebarTabId, visible: boolean, keepOneTabMessage: string) {
        const nextPreferences = setTabVisibility(this.preferences, tabId, visible);
        const changeWasRejected = !visible && nextPreferences.visibleTabs[tabId];

        if (changeWasRejected) {
            this.visibilityInputs.get(tabId)!.checked = true;
            showMessage(keepOneTabMessage);
            return;
        }

        await this.updatePreferences(nextPreferences);
    }

    private async selectTab(tabId: SidebarTabId) {
        if (!this.preferences.visibleTabs[tabId] || this.preferences.activeTab === tabId) {
            return;
        }

        await this.updatePreferences({
            ...this.preferences,
            activeTab: tabId,
        });
    }

    private async updatePreferences(preferences: SidebarHubPreferences) {
        this.preferences = normalizePreferences(preferences);
        for (const tab of TAB_DEFINITIONS) {
            const input = this.visibilityInputs.get(tab.id);
            if (input) {
                input.checked = this.preferences.visibleTabs[tab.id];
            }
        }
        for (const handle of this.dockHandles) {
            handle.updatePreferences(this.preferences);
        }
        await this.saveData(PREFERENCES_FILE, this.preferences);
    }
}
