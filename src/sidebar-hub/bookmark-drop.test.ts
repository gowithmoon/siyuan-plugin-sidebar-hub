import { describe, expect, it } from "vitest";

import { bookmarkDropIds, supportsBookmarkDrop } from "./bookmark-drop";

const workspace = "/workspace";
const id = "20260928120000-abcdefg";

function data(types: string[], values: Record<string, string>) {
    return { types, getData: (type: string) => values[type] ?? "" };
}

describe("书签拖放数据", () => {
    it("解析同工作空间的块引用并去重", () => {
        const transfer = data(["application/siyuan-block-ref"], {
            "application/siyuan-block-ref": JSON.stringify({ workspaceDir: workspace, ids: [id, id] }),
        });
        expect(supportsBookmarkDrop(transfer, workspace)).toBe(true);
        expect(bookmarkDropIds(transfer, workspace)).toEqual([id]);
    });

    it("拒绝跨工作空间块引用、数据库子元素和分隔线", () => {
        expect(bookmarkDropIds(data(["application/siyuan-block-ref"], {
            "application/siyuan-block-ref": JSON.stringify({ workspaceDir: "/other", ids: [id] }),
        }), workspace)).toEqual([]);
        expect(supportsBookmarkDrop(data(["application/siyuan-gutternodeattributeview\u200bviewtab\u200b"], {}), workspace)).toBe(false);
        expect(supportsBookmarkDrop(data(["application/siyuan-gutternodethematicbreak\u200b\u200b"], {}), workspace)).toBe(false);
    });

    it("解析文档树和编辑器页签来源", () => {
        expect(bookmarkDropIds(data(["application/siyuan-file"], { "application/siyuan-file": `${id},${id}` }), workspace)).toEqual([id]);
        expect(bookmarkDropIds(data(["application/siyuan-tab"], {
            "application/siyuan-tab": JSON.stringify({ children: { instance: "Editor", rootId: id } }),
        }), workspace)).toEqual([id]);
    });
});
