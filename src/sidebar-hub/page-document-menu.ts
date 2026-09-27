import type { PageSourceChange } from "./pages";

export interface PageMenuDocument {
    id: string;
    title: string;
}

export type PageDocumentMenuActionId = "rename" | "attributes" | "remove";

export interface PageDocumentMenuAction {
    id: PageDocumentMenuActionId;
    label: string;
    icon: string;
    warning?: boolean;
    execute: () => Promise<void>;
}

interface PageDocumentMenuDependencies {
    isReadOnly: () => boolean;
    labels: Record<PageDocumentMenuActionId, string>;
    requestRename: (document: PageMenuDocument) => Promise<string | null>;
    renameDocument: (id: string, title: string) => Promise<void>;
    loadAttributes: (id: string) => Promise<Record<string, string>>;
    openAttributes: (attributes: Record<string, string>) => void;
    confirmRemove: (document: PageMenuDocument) => Promise<boolean>;
    removeDocument: (id: string) => Promise<void>;
    applyChange: (change: PageSourceChange) => Promise<void> | void;
    reportError: (error: unknown) => void;
}

export interface PageDocumentMenuActions {
    forDocument(document: PageMenuDocument): PageDocumentMenuAction[];
}

export function createPageDocumentMenuActions(
    dependencies: PageDocumentMenuDependencies,
): PageDocumentMenuActions {
    return {
        forDocument(document) {
            const attributes: PageDocumentMenuAction = {
                id: "attributes",
                label: dependencies.labels.attributes,
                icon: "iconAttr",
                execute: () => execute(() => editAttributes(document.id)),
            };
            if (dependencies.isReadOnly()) {
                return [attributes];
            }
            return [{
                id: "rename",
                label: dependencies.labels.rename,
                icon: "iconEdit",
                execute: () => execute(() => rename(document)),
            }, attributes, {
                id: "remove",
                label: dependencies.labels.remove,
                icon: "iconTrashcan",
                warning: true,
                execute: () => execute(() => remove(document)),
            }];
        },
    };

    async function execute(action: () => Promise<void>) {
        try {
            await action();
        } catch (error) {
            dependencies.reportError(error);
        }
    }

    async function rename(document: PageMenuDocument) {
        const requestedTitle = await dependencies.requestRename(document);
        if (requestedTitle === null) {
            return;
        }
        const title = requestedTitle.trim();
        if (!title || title === document.title) {
            return;
        }
        if (!isValidTitle(title)) {
            dependencies.reportError(new Error());
            return;
        }
        await dependencies.renameDocument(document.id, title);
        await dependencies.applyChange({ kind: "rename", id: document.id, title });
    }

    async function editAttributes(documentId: string) {
        const attributes = await dependencies.loadAttributes(documentId);
        dependencies.openAttributes(attributes);
    }

    async function remove(document: PageMenuDocument) {
        if (!await dependencies.confirmRemove(document)) {
            return;
        }
        await dependencies.removeDocument(document.id);
        await dependencies.applyChange({ kind: "remove", ids: [document.id] });
    }
}

function isValidTitle(title: string) {
    return !/[\/\r\n\u2028\u2029\t]/.test(title);
}
