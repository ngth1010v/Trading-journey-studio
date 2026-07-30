import { useState, useEffect, useId } from "react";
import ThemeData, { type Theme, DEFAULT_THEME } from "../../data/theme/ThemeData";
import PageData, { type Page } from "../../data/page/PageData";
import { ELEMENT_MAP } from "../elementMap";

const pageData = new PageData();

export default function FixedContainer({
    pageId,
    elementId
}: {
    pageId: number;
    elementId: number;
}) {
    const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
    const [page, setPage] = useState<Page | null>(null);
    const listenerId = useId();

    useEffect(() => {
        let isMounted = true;
        const themeData = new ThemeData();

        themeData.init()

        themeData.addOnSelectedThemeDataChange(listenerId, () => {
            if (isMounted) setTheme(themeData.getSelected());
        });

        // Initialize and subscribe to PageData updates
        pageData.init();

        const updatePage = () => {
            if (!isMounted) return;
            try {
                const updatedPage = pageData.get(pageId);
                setPage(updatedPage);
            } catch (err) {
                setPage(null);
            }
        };

        updatePage();
        pageData.addOnPageDataChange(listenerId, updatePage);

        return () => {
            isMounted = false;
            themeData.removeOnSelectedThemeDataChange(listenerId);
            themeData.destroy();
            pageData.removeOnPageDataChange(listenerId);
        };
    }, [pageId, listenerId]);
 
    const toRgba = (rgba: [number, number, number, number]) => 
        `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;

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

    // Resolve configuration by falling back to ELEMENT_MAP defaults, then overriding with element specific data
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
                gridTemplateColumns: `repeat(${configData.columns || 1}, 1fr)`,
                gridTemplateRows: `repeat(${configData.rows || 1}, 1fr)`,
                gap: configData.gap || "0px",
                padding: configData.padding || "0px",
                overflow: "hidden", // Fixed container has no scroll
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