import { useEffect, useRef, useId, useState } from "react";
import ThemeData, { type Theme } from "../../data/theme/ThemeData";
import { ELEMENT_MAP } from "../elementMap";
import PageElementData, {type PageElement} from "../../data/pageElement/PageElementData";
import type { RGBA } from "../../shared/type";

const FIXED_CONTAINER_DEFAULT_CONFIG = {
    rows: 1,
    columns: 1,
    padding: "0px",
    gap: "0px"
}


const toRgba = (rgba: RGBA | null) => rgba ? `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})` : "transparent";

export default function FixedContainer({pageElementId}: {pageElementId: number;}) {
    
    const listenerIdRef = useRef<string>("[FixedContainer.tsx]" + String(useId()));
    
    const themeDataRef = useRef<ThemeData>(new ThemeData())
    const pageElementDataRef = useRef<PageElementData>(new PageElementData())

    const [theme,setTheme]                  = useState<Theme>(themeDataRef.current.getSelected())
    const [pageElements, setPageElements]   = useState<PageElement[]|null>(null)
    const [pageElement, setPageElement]     = useState<PageElement|null>(null)
    const [config, setConfig]               = useState<any | null>(null)

    useEffect(()=>{
        themeDataRef.current.init()
        pageElementDataRef.current.init()
        pageElementDataRef.current.config.init(pageElementId, FIXED_CONTAINER_DEFAULT_CONFIG)

        themeDataRef.current.addOnSelectedThemeDataChange(listenerIdRef.current, ()=>{setTheme(themeDataRef.current.getSelected())})
        pageElementDataRef.current.addOnPageElementDataChange(listenerIdRef.current, ()=>{
            setPageElements(pageElementDataRef.current.getAll())
            setPageElement(pageElementDataRef.current.get(pageElementId))
        })
        pageElementDataRef.current.config.addOnPageElementConfigDataChange(listenerIdRef.current, [], ()=>{
            setConfig(pageElementDataRef.current.config.get())
        })
        
        return ()=>{
            pageElementDataRef.current.config.removeOnPageElementConfigDataChange(listenerIdRef.current)
            pageElementDataRef.current.removeOnPageElementDataChange(listenerIdRef.current)
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIdRef.current)

            pageElementDataRef.current.config.destroy()
            pageElementDataRef.current.destroy()
            themeDataRef.current.destroy()
        }
    },[pageElementId])



    if (!pageElement || !config) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: toRgba(theme?.panel.normal1.background ? theme?.panel.normal1.background : null),
                    color: toRgba(theme?.panel.normal1.border ? theme?.panel.normal1.border : null),
                    boxSizing: "border-box"
                }}
            >
                Loading...
            </div>
        );
    }

    // Resolve configuration by falling back to ELEMENT_MAP defaults, then overriding with element specific data
    const children = pageElements?.filter((element) => element.parentId === pageElementId);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: toRgba(theme.panel.normal1.background),
                border: `1px solid ${toRgba(theme.panel.normal1.border)}`,
                display: "grid",
                gridTemplateColumns: `repeat(${config.columns || 1}, 1fr)`,
                gridTemplateRows: `repeat(${config.rows || 1}, 1fr)`,
                gap: config.gap || "0px",
                padding: config.padding || "0px",
                overflow: "hidden", // Fixed container has no scroll
                boxSizing: "border-box"
            }}
        >
            {children?.map((child) => {
                const childCompEntry = ELEMENT_MAP[child.type as keyof typeof ELEMENT_MAP];
                if (!childCompEntry || child.id == null) return null;

                const ChildComponent = childCompEntry.component;

                return (
                    <div
                        key={child.id}
                        style={{
                            gridColumn: `${child.position.x + 1} / span ${child.size.w}`,
                            gridRow: `${child.position.y + 1} / span ${child.size.h}`,
                        }}
                    >
                        <ChildComponent pageElementId={child.id} />
                    </div>
                );
            })}
        </div>
    );
}