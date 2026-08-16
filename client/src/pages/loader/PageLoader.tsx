import { useEffect, useRef, useId, useState } from "react";
import { ELEMENT_MAP } from "../../modules/pageElements/elementMap";
import PageElementData, { type PageElement } from "../../modules/data/pageElement/PageElementData";

interface PageLoaderProps {
  pageElementId: number;
}

export default function PageLoader({ pageElementId }: PageLoaderProps) {
  const listenerIdRef = useRef<string>("[PageLoader.tsx]" + String(useId()));
  const pageElementDataRef = useRef<PageElementData>(new PageElementData());

  const [pageElements, setPageElements] = useState<PageElement[] | null>(null);
  const [pageElement, setPageElement] = useState<PageElement | null>(null);

  useEffect(() => {
    pageElementDataRef.current.init();

    pageElementDataRef.current.addOnPageElementDataChange(listenerIdRef.current, () => {
      setPageElements(pageElementDataRef.current.getAll());
      setPageElement(pageElementDataRef.current.get(pageElementId));
    });

    return () => {
      pageElementDataRef.current.removeOnPageElementDataChange(listenerIdRef.current);
      pageElementDataRef.current.destroy();
    };
  }, [pageElementId]);

  if (!pageElement) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        Loading...
      </div>
    );
  }

  const children = pageElements?.filter((element) => element.id === pageElementId);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateColumns: "repeat(1, 1fr)",
        gridTemplateRows: "repeat(1, 1fr)",
        gap: "0px",
        padding: "0px",
        overflow: "hidden",
        boxSizing: "border-box",
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
              gridColumn: "1 / span 1",
              gridRow: "1 / span 1",
            }}
          >
            <ChildComponent pageElementId={child.id} />
          </div>
        );
      })}
    </div>
  );
}