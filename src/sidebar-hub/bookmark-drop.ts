import type { EntryDragData, EntryDropHandlers } from "./entry-drop-target";

const BLOCK_REF = "application/siyuan-block-ref";
const GUTTER = "application/siyuan-gutter";
const FILE = "application/siyuan-file";
const TAB = "application/siyuan-tab";
const BLOCK_ID = /^\d{14}-[0-9a-z]{7}$/;

interface BookmarkDropDependencies {
    isReadOnly: () => boolean;
    workspaceDir: () => string;
    defaultBookmark: () => string;
    setBookmarks: (ids: string[], bookmark: string) => Promise<void>;
    onChanged: () => Promise<void> | void;
    reportError: (error: unknown) => void;
}

type DropSource =
    | { kind: "block-ref" }
    | { kind: "gutter"; parts: string[] }
    | { kind: "file" }
    | { kind: "tab" };

export function createBookmarkDropHandlers(dependencies: BookmarkDropDependencies): EntryDropHandlers {
    return {
        accepts(data) {
            return !dependencies.isReadOnly() && supportsBookmarkDrop(data, dependencies.workspaceDir());
        },
        async drop(data, sectionKey) {
            if (dependencies.isReadOnly()) {
                return;
            }
            const ids = bookmarkDropIds(data, dependencies.workspaceDir());
            const bookmark = sectionKey ?? dependencies.defaultBookmark();
            if (!ids.length || !bookmark) {
                return;
            }
            try {
                await dependencies.setBookmarks(ids, bookmark);
                await dependencies.onChanged();
            } catch (error) {
                dependencies.reportError(error);
            }
        },
    };
}

export function supportsBookmarkDrop(data: EntryDragData, workspaceDir: string): boolean {
    const source = readDropSource(data);
    if (!source) {
        return false;
    }
    if (source.kind === "block-ref") {
        // 拖动经过目标时浏览器保护载荷，工作空间在 drop 时再次校验。
        return true;
    }
    if (source.kind === "gutter") {
        const [type, subtype, , workspace] = source.parts;
        if (["nodeattributeviewrowmenu", "nodeattributeviewrow", "nodethematicbreak"].includes(type)
            || (type === "nodeattributeview" && ["viewtab", "col", "galleryitem"].includes(subtype))) {
            return false;
        }
        return !workspace || workspace === workspaceDir.toLowerCase();
    }
    return true;
}

export function bookmarkDropIds(data: EntryDragData, workspaceDir: string): string[] {
    if (!supportsBookmarkDrop(data, workspaceDir)) {
        return [];
    }
    let ids: unknown[] = [];
    try {
        const source = readDropSource(data);
        if (!source) {
            return [];
        }
        if (source.kind === "block-ref") {
            const value: unknown = JSON.parse(data.getData(BLOCK_REF));
            if (isRecord(value) && typeof value.workspaceDir === "string"
                && value.workspaceDir.toLowerCase() === workspaceDir.toLowerCase()
                && Array.isArray(value.ids)) {
                ids = value.ids;
            }
        } else {
            if (source.kind === "gutter") {
                ids = (source.parts[2] ?? "").split(",");
            } else if (source.kind === "file") {
                ids = data.getData(FILE).split(",");
            } else if (source.kind === "tab") {
                const value: unknown = JSON.parse(data.getData(TAB));
                if (isRecord(value) && isRecord(value.children) && value.children.instance === "Editor") {
                    ids = [value.children.rootId];
                }
            }
        }
    } catch {
        return [];
    }
    return [...new Set(ids.filter((id): id is string => typeof id === "string" && BLOCK_ID.test(id)))];
}

function gutterParts(data: EntryDragData): string[] | undefined {
    const type = data.types.find((value) => value.startsWith(GUTTER));
    return type?.slice(GUTTER.length).replace(/^\u200b/, "").split("\u200b");
}

function readDropSource(data: EntryDragData): DropSource | undefined {
    if (data.types.includes(BLOCK_REF)) {
        return { kind: "block-ref" };
    }
    const parts = gutterParts(data);
    if (parts) {
        return { kind: "gutter", parts };
    }
    if (data.types.includes(FILE)) {
        return { kind: "file" };
    }
    if (data.types.includes(TAB)) {
        return { kind: "tab" };
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
