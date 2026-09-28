export type EntryDragKind = "document" | "block";

export interface EntryDragDataTransfer {
    effectAllowed: string;
    setData(type: string, value: string): void;
}

export interface EntryDragRuntime {
    dragTitle: string;
    dragElement?: HTMLElement;
}

export type EntryDragTarget =
    | { kind: "document"; id: string }
    | { kind: "block"; id: string; workspaceDir: string };

export function startEntryDrag(
    dataTransfer: EntryDragDataTransfer,
    target: EntryDragTarget,
    title: string,
    runtime: EntryDragRuntime,
    documentSelf: Document,
) {
    finishEntryDrag(runtime);
    writeEntryDragData(dataTransfer, target);
    runtime.dragTitle = title;
    if (target.kind === "document") {
        runtime.dragElement = documentSelf.createElement("div");
        runtime.dragElement.innerText = target.id;
    }
}

export function finishEntryDrag(runtime: EntryDragRuntime) {
    runtime.dragTitle = "";
    runtime.dragElement = undefined;
}

export function writeEntryDragData(dataTransfer: EntryDragDataTransfer, target: EntryDragTarget) {
    if (target.kind === "document") {
        dataTransfer.setData("application/siyuan-file", target.id);
        dataTransfer.setData("application/siyuan-documents", JSON.stringify({ ids: [target.id] }));
    } else {
        dataTransfer.setData("application/siyuan-block-ref", JSON.stringify({
            ids: [target.id],
            workspaceDir: target.workspaceDir,
        }));
    }
    dataTransfer.effectAllowed = "copyMove";
}
