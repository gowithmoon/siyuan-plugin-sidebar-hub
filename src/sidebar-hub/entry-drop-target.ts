export type EntryDragData = Pick<DataTransfer, "types" | "getData">;

export interface EntryDropHandlers {
    accepts: (data: EntryDragData) => boolean;
    drop: (data: EntryDragData, sectionKey: string | null) => Promise<void>;
}

interface DropTargetOptions {
    handlers: EntryDropHandlers;
    sectionKey: string | null;
    enabled: boolean;
}

export function entryDropTarget(node: HTMLElement, initial: DropTargetOptions | undefined) {
    let options = initial;
    let depth = 0;
    const clear = () => {
        depth = 0;
        node.classList.remove("sidebar-hub__drop-target");
    };
    const accepts = (event: DragEvent) => Boolean(
        options?.enabled && event.dataTransfer && options.handlers.accepts(event.dataTransfer),
    );
    const enter = (event: DragEvent) => {
        if (accepts(event)) {
            depth += 1;
            event.preventDefault();
        }
    };
    const over = (event: DragEvent) => {
        if (!accepts(event)) {
            clear();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer!.dropEffect = "copy";
        node.classList.add("sidebar-hub__drop-target");
    };
    const leave = () => {
        depth -= 1;
        if (depth <= 0) {
            clear();
        }
    };
    const drop = (event: DragEvent) => {
        clear();
        if (!accepts(event)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        void options!.handlers.drop(event.dataTransfer!, options!.sectionKey);
    };
    node.addEventListener("dragenter", enter);
    node.addEventListener("dragover", over);
    node.addEventListener("dragleave", leave);
    node.addEventListener("drop", drop);
    node.ownerDocument.addEventListener("dragend", clear);
    return {
        update(next: DropTargetOptions | undefined) {
            options = next;
            if (!options?.enabled) {
                clear();
            }
        },
        destroy() {
            clear();
            node.removeEventListener("dragenter", enter);
            node.removeEventListener("dragover", over);
            node.removeEventListener("dragleave", leave);
            node.removeEventListener("drop", drop);
            node.ownerDocument.removeEventListener("dragend", clear);
        },
    };
}
