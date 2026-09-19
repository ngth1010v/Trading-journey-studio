import { useEffect, useState, useRef } from "react";
import style from "./ShapeBar.module.css";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import ThemeData, { type Theme } from "../../../../../../data/theme/ThemeData";
import type StateData from "../../../state/StateData";
import type { Tool } from "../../../state/shapeEditor/ShapeEditorData";
import type { ShapeType } from "../../../state/source/shape/shapeType";

import EyeIcon from "../../../../../../../assets/icons/eye.svg?react";
import EyeSlashIcon from "../../../../../../../assets/icons/eye-slash.svg?react";
import CursorIcon from "../../../../../../../assets/icons/cursor-fill.svg?react";
import TrendLineIcon from "../../../../../../../assets/icons/shapes/line-segment.svg?react";
import HSegIcon from "../../../../../../../assets/icons/shapes/horizontal-line-segment.svg?react";
import VSegIcon from "../../../../../../../assets/icons/shapes/vertical-line-segment.svg?react";
import HLineIcon from "../../../../../../../assets/icons/shapes/horizontal-line.svg?react";
import HRayIcon from "../../../../../../../assets/icons/shapes/horizontal-ray.svg?react";
import VLineIcon from "../../../../../../../assets/icons/shapes/vertical-line.svg?react";
import RectIcon from "../../../../../../../assets/icons/shapes/bounding-box.svg?react";
import TextIcon from "../../../../../../../assets/icons/text-t.svg?react";

const ID_BASE = "[candleChart][interface][navigation][shape][ShapeBar.tsx]";

const TOOLS: { tool: ShapeType; label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
  { tool: "trendLine", label: "Trend line", Icon: TrendLineIcon },
  { tool: "hSegment", label: "Horizontal segment", Icon: HSegIcon },
  { tool: "hLine", label: "Horizontal line", Icon: HLineIcon },
  { tool: "hRay", label: "Horizontal ray", Icon: HRayIcon },
  { tool: "vSegment", label: "Vertical segment", Icon: VSegIcon },
  { tool: "vLine", label: "Vertical line", Icon: VLineIcon },
  { tool: "rectangle", label: "Rectangle", Icon: RectIcon },
  { tool: "text", label: "Text", Icon: TextIcon },
];

export default function ShapeBar({ state }: { state: StateData }) {
  const themeDataRef = useRef<ThemeData>(new ThemeData());
  const [theme, setTheme] = useState<Theme | null>(null);
  const [visible, setVisible] = useState<boolean>(true);
  const [strategyId, setStrategyId] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("cursor");

  useEffect(() => {
    themeDataRef.current.init();
    themeDataRef.current.addOnSelectedThemeDataChange(`${ID_BASE} theme`, () =>
      setTheme(themeDataRef.current.getSelected())
    );

    const updateFromConfig = () => {
      const config = state.config.get();
      setVisible(config?.shape?.visible !== false);
      setStrategyId(config?.strategyId ?? null);
    };
    updateFromConfig();
    state.config.addOnConfigDataChange(`${ID_BASE} config`, ["shape", "strategyId"], updateFromConfig);

    const updateTool = () => setTool(state.shapeEditor.tool);
    updateTool();
    state.shapeEditor.addOnChange(`${ID_BASE} editor`, updateTool);

    return () => {
      themeDataRef.current.removeOnSelectedThemeDataChange(`${ID_BASE} theme`);
      themeDataRef.current.destroy();
      state.config.removeOnConfigDataChange(`${ID_BASE} config`);
      state.shapeEditor.removeOnChange(`${ID_BASE} editor`);
    };
  }, [state]);

  const disabled = !visible || strategyId == null;
  const disabledReason = strategyId == null ? "Select a strategy first" : "Shapes are hidden";

  const iconFill = "rgb(255,255,255)";
  const activeFill = theme?.button?.primary1?.font ? `rgb(${theme.button.primary1.font.join(",")})` : "rgb(255,255,255)";

  const toggleVisible = () => {
    const next = !visible;
    state.config.set({ shape: { visible: next } });
    if (!next) {
      state.shapeEditor.reset();
    }
  };

  const selectTool = (t: Tool) => {
    if (disabled) return;
    state.shapeEditor.setTool(tool === t ? "cursor" : t);
  };

  return (
    <FixedHorizontalList dividerList={[true]}>
      <button
        type="button"
        className={style.toolButton}
        title={visible ? "Hide all shapes" : "Show all shapes"}
        onClick={toggleVisible}
      >
        {visible ? <EyeIcon style={{ fill: iconFill, color: iconFill, width: 12, height: 12 }} /> : <EyeSlashIcon style={{ fill: iconFill, color: iconFill, width: 12, height: 12 }} />}
      </button>

      <button
        type="button"
        className={`${style.toolButton} ${tool === "cursor" ? style.toolButtonActive : ""}`}
        title="Cursor"
        onClick={() => state.shapeEditor.setTool("cursor")}
      >
        <CursorIcon style={{ fill: tool === "cursor" ? activeFill : iconFill, width: 12, height: 12 }} />
      </button>

      {TOOLS.map(({ tool: t, label, Icon }) => (
        <button
          key={t}
          type="button"
          className={`${style.toolButton} ${tool === t ? style.toolButtonActive : ""}`}
          title={disabled ? disabledReason : label}
          disabled={disabled}
          onClick={() => selectTool(t)}
        >
          <Icon style={{ fill: tool === t ? activeFill : iconFill, color: tool === t ? activeFill : iconFill, width: 12, height: 12 }} />
        </button>
      ))}
    </FixedHorizontalList>
  );
}
