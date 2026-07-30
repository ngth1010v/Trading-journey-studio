import { useEffect, useRef, useReducer, useId } from "react";
import ThemeData, { type Theme, DEFAULT_THEME } from "../../data/theme/ThemeData";
import PageData, { type Page } from "../../data/page/PageData";
import { ELEMENT_MAP } from "../elementMap";

export default function HorizontalContainer({
    pageId,
    elementId
}: {
    pageId: number;
    elementId: number;
}) {
    const themeRef = useRef<Theme>(DEFAULT_THEME);
    const pageRef = useRef<Page | null>(null);

    const themeDataRef = useRef<ThemeData | null>(null);
    const pageDataRef = useRef<PageData | null>(null);

    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    const listenerId = useId();

    useEffect(() => {
        let isMounted = true;

        // Initialize ThemeData
        const themeData = new ThemeData();
        themeDataRef.current = themeData;
        themeData.init();

        themeData.addOnSelectedThemeDataChange(listenerId, () => {
            if (isMounted) {
                themeRef.current = themeData.getSelected();
                forceUpdate();
            }
        });

        // Initialize PageData
        const pageData = new PageData();
        pageDataRef.current = pageData;
        pageData.init();

        const updatePage = () => {
            if (!isMounted) return;
            try {
                const updatedPage = pageData.get(pageId);
                pageRef.current = updatedPage;
            } catch (err) {
                pageRef.current = null;
            }
            forceUpdate();
        };

        updatePage();
        pageData.addOnPageDataChange(listenerId, updatePage);

        return () => {
            isMounted = false;
            themeData.removeOnSelectedThemeDataChange(listenerId);
            themeData.destroy();

            pageData.removeOnPageDataChange(listenerId);
            pageData.destroy();

            themeDataRef.current = null;
            pageDataRef.current = null;
        };
    }, [pageId, listenerId]);

    const toRgba = (rgba: [number, number, number, number]) =>
        `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;

    const theme = themeRef.current;
    const page = pageRef.current;

    if (!page) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: toRgba(theme.panel.normal1.background),
                    color: toRgba(theme.panel.normal1.border),
                    boxSizing: "border-box"
                }}
            >
                Loading...
            </div>
        );
    }

    const element = page.data.find((el) => el.id === elementId);
    if (!element) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: toRgba(theme.panel.normal1.background),
                    color: toRgba(theme.panel.normal1.border),
                    boxSizing: "border-box"
                }}
            >
                Loading...
            </div>
        );
    }

    const compConfig = ELEMENT_MAP[element.type as keyof typeof ELEMENT_MAP];
    const configData = { ...compConfig?.data, ...element.data };

    const children = page.data.filter((el) => el.parentId === elementId);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: toRgba(theme.panel.normal1.background),
                border: `1px solid ${toRgba(theme.panel.normal1.border)}`,
                display: "grid",
                // Item width acts as the fixed column size
                gridTemplateColumns: `repeat(${configData.columns || 1}, ${configData.itemWidth || '1fr'})`,
                gridTemplateRows: `repeat(${configData.rows || 1}, 1fr)`,
                gap: configData.gap || "0px",
                padding: configData.padding || "0px",
                overflowX: "auto", // Allows horizontal scroll
                overflowY: "hidden", // Disables vertical scroll
                boxSizing: "border-box"
            }}
        >
            {children.map((child) => {
                const childCompEntry = ELEMENT_MAP[child.type as keyof typeof ELEMENT_MAP];
                if (!childCompEntry) return null;

                const ChildComponent = childCompEntry.component;

                return (
                    <div
                        key={child.id}
                        style={{
                            gridColumn: `${child.position.x + 1} / span ${child.size.w}`,
                            gridRow: `${child.position.y + 1} / span ${child.size.h}`,
                        }}
                    >
                        <ChildComponent pageId={pageId} elementId={child.id} />
                    </div>
                );
            })}
        </div>
    );
}