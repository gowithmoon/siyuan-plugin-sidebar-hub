export const VIRTUAL_LIST_ROW_HEIGHT = 31;
export const VIRTUAL_LIST_OVERSCAN = 8;

export interface FixedVirtualListWindow {
    scrollTop: number;
    totalHeight: number;
    startIndex: number;
    endIndex: number;
    paddingTop: number;
}

export interface FixedVirtualList {
    readonly window: FixedVirtualListWindow;
    setItems(keys: readonly string[]): FixedVirtualListWindow;
    setViewportHeight(height: number): FixedVirtualListWindow;
    setScrollTop(scrollTop: number): FixedVirtualListWindow;
    resetScroll(): FixedVirtualListWindow;
}

interface ScrollAnchor {
    key: string;
    index: number;
    offset: number;
}

export function createFixedVirtualList(): FixedVirtualList {
    let keys: readonly string[] = [];
    let viewportHeight = 0;
    let scrollTop = 0;
    let currentWindow = calculateWindow();

    function calculateWindow(): FixedVirtualListWindow {
        const totalHeight = keys.length * VIRTUAL_LIST_ROW_HEIGHT;
        const maximumScrollTop = Math.max(0, totalHeight - viewportHeight);
        scrollTop = clamp(Number.isFinite(scrollTop) ? scrollTop : maximumScrollTop, 0, maximumScrollTop);

        if (keys.length === 0 || viewportHeight === 0) {
            return {
                scrollTop,
                totalHeight,
                startIndex: 0,
                endIndex: 0,
                paddingTop: 0,
            };
        }

        const firstVisibleIndex = Math.floor(scrollTop / VIRTUAL_LIST_ROW_HEIGHT);
        const visibleEndIndex = Math.min(
            keys.length,
            Math.ceil((scrollTop + viewportHeight) / VIRTUAL_LIST_ROW_HEIGHT),
        );
        const startIndex = Math.max(0, firstVisibleIndex - VIRTUAL_LIST_OVERSCAN);
        const endIndex = Math.min(keys.length, visibleEndIndex + VIRTUAL_LIST_OVERSCAN);

        return {
            scrollTop,
            totalHeight,
            startIndex,
            endIndex,
            paddingTop: startIndex * VIRTUAL_LIST_ROW_HEIGHT,
        };
    }

    function publish() {
        currentWindow = calculateWindow();
        return currentWindow;
    }

    function captureAnchor(): ScrollAnchor | undefined {
        if (keys.length === 0) {
            return undefined;
        }
        const index = Math.min(keys.length - 1, Math.floor(scrollTop / VIRTUAL_LIST_ROW_HEIGHT));
        return {
            key: keys[index],
            index,
            offset: scrollTop - index * VIRTUAL_LIST_ROW_HEIGHT,
        };
    }

    return {
        get window() {
            return currentWindow;
        },
        setItems(nextKeys) {
            const anchor = captureAnchor();
            keys = nextKeys;
            if (anchor && keys.length > 0) {
                const anchoredIndex = keys.indexOf(anchor.key);
                const nextIndex = anchoredIndex >= 0
                    ? anchoredIndex
                    : Math.min(anchor.index, keys.length - 1);
                scrollTop = nextIndex * VIRTUAL_LIST_ROW_HEIGHT + anchor.offset;
            }
            return publish();
        },
        setViewportHeight(height) {
            viewportHeight = Math.max(0, Number.isFinite(height) ? height : 0);
            return publish();
        },
        setScrollTop(nextScrollTop) {
            scrollTop = nextScrollTop;
            return publish();
        },
        resetScroll() {
            scrollTop = 0;
            return publish();
        },
    };
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}
