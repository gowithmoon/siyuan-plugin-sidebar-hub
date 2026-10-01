import type { IOperation, IWebSocketData } from "siyuan";

import { SIDEBAR_TAB_IDS, type SidebarTabId } from "./preferences";
import type { PageSourceChange } from "./pages";

export interface SourceInvalidation {
    tabs: SidebarTabId[];
    dailyNotes?: boolean;
    pageChange?: PageSourceChange;
}

const ALL_TABS = [...SIDEBAR_TAB_IDS];
const ALL_SOURCES: SourceInvalidation = { tabs: ALL_TABS, dailyNotes: true };
const DATABASE_ACTION = /AttrView|attrView/i;

const ALL_SOURCE_COMMANDS = new Set([
    "closeBox",
    "mount",
    "removeBox",
]);

const DOCUMENT_REMOVAL_COMMANDS = new Set([
    "removeDoc",
]);

const PAGE_COMMANDS = new Set([
    "create",
    "createdailynote",
    "createnotebook",
    "heading2doc",
    "li2doc",
    "moveDoc",
    "moveDocs",
    "reloadFiletree",
    "rename",
    "renamenotebook",
]);

export function sourceInvalidationForEvent(
    type: "ws-main" | "opened-notebook" | "closed-notebook",
    detail?: Pick<IWebSocketData, "cmd" | "data">,
): SourceInvalidation | undefined {
    if (type === "opened-notebook" || type === "closed-notebook") {
        return ALL_SOURCES;
    }
    if (detail?.cmd === "transactions") {
        return invalidationForTransactions(detail.data);
    }
    if (detail?.cmd === "refreshAttributeView") {
        return { tabs: ["databases"] };
    }
    if (detail?.cmd && ALL_SOURCE_COMMANDS.has(detail.cmd)) {
        return ALL_SOURCES;
    }
    if (detail?.cmd && DOCUMENT_REMOVAL_COMMANDS.has(detail.cmd)) {
        return withPageChange(
            { tabs: ["bookmarks", "tags", "databases", "pages"], dailyNotes: true },
            parsePageChange(detail.cmd, detail.data),
        );
    }
    if (detail?.cmd === "createdailynote") {
        return { tabs: ["pages"], dailyNotes: true };
    }
    if (detail?.cmd && PAGE_COMMANDS.has(detail.cmd)) {
        return withPageChange(
            { tabs: detail.cmd === "rename" ? ["bookmarks", "pages"] : ["pages"] },
            parsePageChange(detail.cmd, detail.data),
        );
    }
    return undefined;
}

function withPageChange(base: SourceInvalidation, pageChange: PageSourceChange | undefined): SourceInvalidation {
    return pageChange ? { ...base, pageChange } : base;
}

function parsePageChange(cmd: string, data: unknown): PageSourceChange | undefined {
    if (!isRecord(data)) {
        return undefined;
    }
    if (cmd === "rename" && typeof data.id === "string" && typeof data.title === "string") {
        return { kind: "rename", id: data.id, title: data.title };
    }
    if (cmd === "removeDoc" && Array.isArray(data.ids)
        && data.ids.every((id): id is string => typeof id === "string")) {
        return { kind: "remove", ids: data.ids };
    }
    if (cmd === "moveDoc"
        && typeof data.fromNotebook === "string"
        && typeof data.fromPath === "string"
        && typeof data.toNotebook === "string"
        && typeof data.newPath === "string") {
        return {
            kind: "move",
            fromNotebook: data.fromNotebook,
            fromPath: data.fromPath,
            toNotebook: data.toNotebook,
            newPath: data.newPath,
        };
    }
    return undefined;
}

function invalidationForTransactions(data: unknown): SourceInvalidation | undefined {
    const operations = transactionOperations(data);
    const tabs = new Set<SidebarTabId>();

    for (const operation of operations) {
        if (affectsBookmarks(operation)) {
            tabs.add("bookmarks");
        }
        if (affectsTags(operation)) {
            tabs.add("tags");
        }
        if (affectsDatabases(operation)) {
            tabs.add("databases");
        }
    }

    const affectedTabs = ALL_TABS.filter((tabId) => tabs.has(tabId));
    return affectedTabs.length > 0 ? { tabs: affectedTabs } : undefined;
}

function transactionOperations(data: unknown): IOperation[] {
    if (!Array.isArray(data)) {
        return [];
    }
    return data.flatMap((transaction) => {
        if (!isRecord(transaction) || !Array.isArray(transaction.doOperations)) {
            return [];
        }
        return transaction.doOperations.filter(isOperation);
    });
}

function affectsBookmarks(operation: IOperation) {
    if (operation.action === "delete") {
        return true;
    }
    if ((operation.action === "update" || operation.action === "insert") && typeof operation.data === "string") {
        return operation.data.includes("protyle-attr--bookmark");
    }
    if (operation.action !== "updateAttrs" || !isRecord(operation.data)) {
        return false;
    }
    const oldAttrs = isRecord(operation.data.old) ? operation.data.old : {};
    const newAttrs = isRecord(operation.data.new) ? operation.data.new : {};
    return oldAttrs.bookmark !== newAttrs.bookmark;
}

function affectsTags(operation: IOperation) {
    if (operation.action === "delete") {
        return true;
    }
    return (operation.action === "update" || operation.action === "insert")
        && typeof operation.data === "string"
        && operation.data.includes('data-type="tag"');
}

function affectsDatabases(operation: IOperation) {
    return Boolean(operation.avID) || DATABASE_ACTION.test(operation.action);
}

function isOperation(value: unknown): value is IOperation {
    return isRecord(value) && typeof value.action === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
