import { Plugin, showMessage } from "siyuan";
import { mount, unmount } from "svelte";

import SidebarHub from "./sidebar-hub/sidebar-hub.svelte";
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
    contentPending: string;
    visibleTabsDescription: string;
    keepOneTab: string;
    tabs: Record<SidebarTabId, string>;
}

export default class SidebarHubPlugin extends Plugin {
    private preferences: SidebarHubPreferences = DEFAULT_PREFERENCES;
    private readonly dockHandles = new Set<SidebarHubHandle>();
    private readonly visibilityInputs = new Map<SidebarTabId, HTMLInputElement>();

    async onload() {
        this.preferences = normalizePreferences(await this.loadData(PREFERENCES_FILE));

        const translations = this.i18n.sidebarHub as unknown as SidebarHubTranslations;
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
