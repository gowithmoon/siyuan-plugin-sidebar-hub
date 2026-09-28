import { describe, expect, it } from "vitest";

import {
    finishEntryDrag,
    startEntryDrag,
    writeEntryDragData,
    type EntryDragDataTransfer,
} from "./entry-drag";

function createDataTransfer() {
    const values = new Map<string, string>();
    const dataTransfer: EntryDragDataTransfer = {
        effectAllowed: "none",
        setData(type, value) {
            values.set(type, value);
        },
    };
    return { dataTransfer, values };
}

describe("条目拖拽载荷", () => {
    it("为页面文档写入思源原生文档载荷", () => {
        const { dataTransfer, values } = createDataTransfer();

        writeEntryDragData(dataTransfer, {
            kind: "document",
            id: "20240101000000-abcdefg",
        });

        expect(values.get("application/siyuan-file")).toBe("20240101000000-abcdefg");
        expect(values.get("application/siyuan-documents")).toBe(JSON.stringify({ ids: ["20240101000000-abcdefg"] }));
        expect(values.has("application/siyuan-block-ref")).toBe(false);
        expect(dataTransfer.effectAllowed).toBe("copyMove");
    });

    it("为书签块写入带工作空间校验的块引用载荷", () => {
        const { dataTransfer, values } = createDataTransfer();

        writeEntryDragData(dataTransfer, {
            kind: "block",
            id: "20240101000000-abcdefg",
            workspaceDir: "/workspace",
        });

        expect(JSON.parse(values.get("application/siyuan-block-ref")!)).toEqual({
            ids: ["20240101000000-abcdefg"],
            workspaceDir: "/workspace",
        });
        expect(values.has("application/siyuan-file")).toBe(false);
        expect(values.has("application/siyuan-documents")).toBe(false);
        expect(dataTransfer.effectAllowed).toBe("copyMove");
    });

    it("用当前目标替换旧拖拽状态并在结束时清理", () => {
        const { dataTransfer } = createDataTransfer();
        const runtime = {
            dragTitle: "旧标题",
            dragElement: { innerText: "20230101000000-oldold0" } as HTMLElement,
        };
        const documentSelf = {
            createElement: () => ({ innerText: "" }),
        } as unknown as Document;

        startEntryDrag(dataTransfer, {
            kind: "document",
            id: "20240101000000-abcdefg",
        }, "当前文档", runtime, documentSelf);

        expect(runtime.dragTitle).toBe("当前文档");
        expect(runtime.dragElement?.innerText).toBe("20240101000000-abcdefg");

        startEntryDrag(dataTransfer, {
            kind: "block",
            id: "20240202000000-hijklmn",
            workspaceDir: "/workspace",
        }, "当前块", runtime, documentSelf);
        expect(runtime.dragTitle).toBe("当前块");
        expect(runtime.dragElement).toBeUndefined();

        finishEntryDrag(runtime);
        expect(runtime.dragTitle).toBe("");
        expect(runtime.dragElement).toBeUndefined();
    });
});
