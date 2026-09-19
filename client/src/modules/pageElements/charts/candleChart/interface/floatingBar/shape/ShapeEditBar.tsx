import React, { useEffect, useState, useRef } from "react";
import style from "./ShapeEditBar.module.css";
import FixedHorizontalList from "../../../../../../shared/components/list/FixedHorizontalList";
import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import ScrollVerticalList from "../../../../../../shared/components/list/ScrollVerticalList";
import PanelInput from "../../../../../../input/panel/PanelInput";
import ThemeData, { type Theme } from "../../../../../../data/theme/ThemeData";
import type StateData from "../../../state/StateData";
import type ChartController from "../../../chart/ChartController";
import type { ShapeStyleJson, TypedShape } from "../../../state/source/shape/shapeType";
import { isTypedShape } from "../../../state/source/shape/shapeType";
import type { ShapeTag } from "../../../state/source/shape/tag/ShapeTagData";
import type { ShapeTemplate } from "../../../state/source/shape/template/ShapeTemplateData";

import TextIcon from "../../../../../../../assets/icons/text-t.svg?react";
import PaletteIcon from "../../../../../../../assets/icons/paint-brush-broad.svg?react";
import TagIcon from "../../../../../../../assets/icons/bookmark-simple-fill.svg?react";
import TemplateIcon from "../../../../../../../assets/icons/database.svg?react";
import LockIcon from "../../../../../../../assets/icons/lock.svg?react";
import LockOpenIcon from "../../../../../../../assets/icons/lock-open.svg?react";
import CopyIcon from "../../../../../../../assets/icons/copy.svg?react";
import TrashIcon from "../../../../../../../assets/icons/trash.svg?react";

const ID_BASE = "[candleChart][interface][floatingBar][shape][ShapeEditBar.tsx]";

const toRGBA = (c?: number[]) => (c ? `rgba(${c.join(",")})` : undefined);

interface Props {
  state: StateData;
  chart: ChartController;
  dragButton: React.ReactNode;
}

function ApplyFooter({ theme, onApply }: { theme: Theme | null; onApply: () => void }) {
  const saveStyle = {
    "--bg-default": toRGBA(theme?.button.primary2.background),
    "--color-default": toRGBA(theme?.button.primary2.font),
    "--bg-hover": toRGBA(theme?.button.primary1.background),
    "--color-hover": toRGBA(theme?.button.primary1.font),
  } as React.CSSProperties;
  return (
    <div className={style.footer}>
      <div className={style.applyButton} style={saveStyle} onClick={onApply}>Apply</div>
    </div>
  );
}

export default function ShapeEditBar({ state, dragButton }: Props) {
  const themeDataRef = useRef<ThemeData>(new ThemeData());
  const [theme, setTheme] = useState<Theme | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [shape, setShape] = useState<TypedShape | null>(null);
  const [tags, setTags] = useState<ShapeTag[]>([]);
  const [templates, setTemplates] = useState<ShapeTemplate[]>([]);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const autoOpenedTextRef = useRef<number | null>(null);

  useEffect(() => {
    themeDataRef.current.init();
    themeDataRef.current.addOnSelectedThemeDataChange(`${ID_BASE} theme`, () =>
      setTheme(themeDataRef.current.getSelected())
    );

    const refreshShape = () => {
      const id = state.shapeEditor.selectedId;
      setSelectedId(id);
      if (id == null) {
        setShape(null);
        return;
      }
      const found = state.source.shape.getAll().filter(isTypedShape).find((s) => s.id === id);
      setShape(found ?? null);

      // Auto-open the Text popover once, only right after a new text shape is created (not on a later select).
      if (
        found && found.type === "text" && found.id !== undefined &&
        state.shapeEditor.justCreatedId === found.id && autoOpenedTextRef.current !== found.id
      ) {
        autoOpenedTextRef.current = found.id;
        setOpenPopover("text");
      }
    };
    refreshShape();
    state.shapeEditor.addOnChange(`${ID_BASE} editor`, refreshShape);
    state.source.shape.addOnShapeDataChange(`${ID_BASE} shapeData`, refreshShape);
    state.source.shape.tag.addOnShapeTagDataChange(`${ID_BASE} tags`, () => setTags(state.source.shape.tag.getAll()));
    state.source.shape.template.addOnShapeTemplateDataChange(`${ID_BASE} templates`, () =>
      setTemplates(state.source.shape.template.getAll())
    );

    return () => {
      themeDataRef.current.removeOnSelectedThemeDataChange(`${ID_BASE} theme`);
      themeDataRef.current.destroy();
      state.shapeEditor.removeOnChange(`${ID_BASE} editor`);
      state.source.shape.removeOnShapeDataChange(`${ID_BASE} shapeData`);
      state.source.shape.tag.removeOnShapeTagDataChange(`${ID_BASE} tags`);
      state.source.shape.template.removeOnShapeTemplateDataChange(`${ID_BASE} templates`);
    };
  }, [state]);

  if (!shape || selectedId == null) return null;

  // Popovers not built on PanelInput need the panel theme themselves.
  const panel = theme?.panel.normal1;
  const panelStyle: React.CSSProperties = {
    backgroundColor: toRGBA(panel?.background),
    border: panel ? `1px solid ${toRGBA(panel.border)}` : undefined,
    color: panel ? `rgb(${panel.font.join(",")})` : undefined,
  };

  const iconFill = "rgb(255,255,255)";

  const saveShape = (updated: TypedShape) => {
    // Remember the latest style per type so the next new shape of this type starts with it.
    if (JSON.stringify(updated.style) !== JSON.stringify(shape.style)) {
      state.config.set({ shape: { lastStyle: { [updated.type]: updated.style } } });
    }
    state.source.shape.set(updated).catch((err) => console.error("ShapeEditBar: save failed:", err));
  };

  // ---------------------------------------------------------------------
  // TEXT popover
  // ---------------------------------------------------------------------
  const renderTextPopover = () => {
    const textStyle = shape.style.text ?? { color: [255, 255, 255, 255] as const, size: 12, alignX: "center" as const, alignY: "above" as const };
    const initial = { text: shape.data.text ?? "", color: textStyle.color as number[], size: textStyle.size, alignX: textStyle.alignX, alignY: textStyle.alignY };
    return <TextForm key={shape.id} shape={shape} theme={theme} onApply={saveShape} initial={initial} />;
  };

  // ---------------------------------------------------------------------
  // STYLE popover
  // ---------------------------------------------------------------------
  const renderStylePopover = () => <StyleForm key={shape.id} shape={shape} onApply={saveShape} />;

  // ---------------------------------------------------------------------
  // TAG popover
  // ---------------------------------------------------------------------
  const toggleTag = (tagId: number | undefined) => {
    if (tagId === undefined) return;
    const exists = shape.tagIds.includes(tagId);
    const newTagIds = exists ? shape.tagIds.filter((id) => id !== tagId) : [...shape.tagIds, tagId];
    saveShape({ ...shape, tagIds: newTagIds });
  };

  const renderTagPopover = () => (
    <div className={style.listPopover} style={panelStyle}>
    <ScrollVerticalList selectedList={[...tags.map((t) => t.id !== undefined && shape.tagIds.includes(t.id)), false]}>
      {tags.map((tag) => {
        return (
          <div key={tag.id} className={style.tagRow} onClick={() => toggleTag(tag.id)}>
            <TagIcon style={{ fill: `rgb(${tag.color.font.join(",")})`, width: 12, height: 12 }} />
            <span>{tag.name}</span>
          </div>
        );
      })}
      <NewTagRow onCreate={(tag) => state.source.shape.tag.set(tag)} />
    </ScrollVerticalList>
    </div>
  );

  // ---------------------------------------------------------------------
  // TEMPLATE popover
  // ---------------------------------------------------------------------
  const applyTemplate = (template: ShapeTemplate) => saveShape({ ...shape, style: template.style as ShapeStyleJson });
  const matchingTemplates = templates.filter((t) => t.type === shape.type);

  const renderTemplatePopover = () => (
    <div className={style.listPopover} style={panelStyle}>
    <ScrollVerticalList>
      {matchingTemplates.map((t) => (
        <div key={t.id} className={style.templateRow}>
          <span className={style.templateName} onClick={() => applyTemplate(t)}>{t.name}</span>
          <TrashIcon
            className={style.templateDelete}
            style={{ fill: iconFill, width: 10, height: 10 }}
            onClick={() => t.id !== undefined && state.source.shape.template.remove(t.id)}
          />
        </div>
      ))}
      <SaveTemplateRow
        onSave={(name) => state.source.shape.template.set({ type: shape.type, name, style: shape.style })}
      />
    </ScrollVerticalList>
    </div>
  );

  // ---------------------------------------------------------------------
  // LOCK / CLONE / DELETE: plain buttons
  // ---------------------------------------------------------------------
  const locked = !!shape.data.locked;
  const toggleLock = () => saveShape({ ...shape, data: { ...shape.data, locked: !locked } });

  const handleClone = async () => {
    const view = state.config.get()?.viewport;
    const offset = view ? (view.toTs - view.fromTs) * 0.05 : 0;
    const points = shape.data.points.map((p: { ts: number; price: number }) => ({ ...p, ts: p.ts + offset }));
    const { id: _omit, ...rest } = shape;
    void _omit;
    const newId = await state.source.shape.set({ ...rest, data: { ...shape.data, points } });
    state.shapeEditor.setSelectedId(newId);
  };

  const handleDelete = async () => {
    if (selectedId == null) return;
    await state.source.shape.remove(selectedId);
    state.shapeEditor.setSelectedId(null);
  };

  const iconProps = { width: 12, height: 12, style: { fill: iconFill, color: iconFill } };

  return (
    <FixedHorizontalList>
      {dragButton}

      <span className={style.typeLabel}>{shape.type}</span>

      {shape.type !== "trendLine" && (
        <ButtonWithPopover
          type="click" position="bottom" align="start"
          open={openPopover === "text"} setOpen={(o: boolean) => setOpenPopover(o ? "text" : null)}
          button={<button type="button" className={style.button}><TextIcon {...iconProps} /></button>}
          popup={renderTextPopover()}
        />
      )}

      {shape.type !== "text" && (
        <ButtonWithPopover
          type="click" position="bottom" align="start"
          open={openPopover === "style"} setOpen={(o: boolean) => setOpenPopover(o ? "style" : null)}
          button={<button type="button" className={style.button}><PaletteIcon {...iconProps} /></button>}
          popup={renderStylePopover()}
        />
      )}

      <ButtonWithPopover
        type="click" position="bottom" align="start"
        open={openPopover === "tag"} setOpen={(o: boolean) => setOpenPopover(o ? "tag" : null)}
        button={<button type="button" className={style.button}><TagIcon {...iconProps} /></button>}
        popup={renderTagPopover()}
      />

      <ButtonWithPopover
        type="click" position="bottom" align="start"
        open={openPopover === "template"} setOpen={(o: boolean) => setOpenPopover(o ? "template" : null)}
        button={<button type="button" className={style.button}><TemplateIcon {...iconProps} /></button>}
        popup={renderTemplatePopover()}
      />

      <button type="button" className={style.button} title={locked ? "Unlock" : "Lock"} onClick={toggleLock}>
        {locked ? <LockIcon {...iconProps} /> : <LockOpenIcon {...iconProps} />}
      </button>

      <button type="button" className={style.button} title="Clone" onClick={handleClone}>
        <CopyIcon {...iconProps} />
      </button>

      <button type="button" className={style.button} title="Delete" onClick={handleDelete}>
        <TrashIcon {...iconProps} />
      </button>
    </FixedHorizontalList>
  );
}

// =========================================================================
// Sub-forms
// =========================================================================

function TextForm({
  shape, theme, onApply, initial,
}: {
  shape: TypedShape; theme: Theme | null; onApply: (s: TypedShape) => void;
  initial: { text: string; color: number[]; size: number; alignX: string; alignY: string };
}) {
  const [form, setForm] = useState(() => structuredClone(initial));
  const isTextType = shape.type === "text";

  const layout = isTextType
    ? { text: "text", color: "rgba", size: "uNumber" }
    : { text: "text", color: "rgba", size: "uNumber", alignX: "lineAlignX", alignY: "lineAlignY" };

  const apply = () => {
    onApply({
      ...shape,
      data: { ...shape.data, text: form.text },
      style: { ...shape.style, text: { color: form.color, size: form.size, alignX: form.alignX, alignY: form.alignY } },
    });
  };

  return (
    <PanelInput
      layout={layout}
      data={form}
      onDataChange={(d) => setForm(d as typeof form)}
      footer={<ApplyFooter theme={theme} onApply={apply} />}
    />
  );
}

function StyleForm({ shape, onApply }: { shape: TypedShape; onApply: (s: TypedShape) => void }) {
  const isRect = shape.type === "rectangle";
  const initial = isRect
    ? { fill: shape.style.fill ?? { color: [41, 98, 255, 40] }, line: shape.style.line ?? { color: [255, 255, 255, 255], thickness: 1, type: "solid" } }
    : { line: shape.style.line ?? { color: [41, 98, 255, 255], thickness: 2, type: "solid" } };
  // Clone: PanelInput edits nested objects in place, which would otherwise mutate the cached shape.
  const [form, setForm] = useState<Partial<ShapeStyleJson>>(() => structuredClone(initial));

  const layout = isRect
    ? { fill: { color: "rgba" }, line: { color: "rgba", thickness: "uNumber", type: "shapeLineType" } }
    : { line: { color: "rgba", thickness: "uNumber", type: "shapeLineType" } };

  // Changes apply immediately; no Apply button.
  const change = (d: Partial<ShapeStyleJson>) => {
    setForm(d);
    onApply({ ...shape, style: structuredClone({ ...shape.style, ...d }) });
  };

  return <PanelInput layout={layout} data={form} onDataChange={(d) => change(d)} />;
}

function NewTagRow({ onCreate }: { onCreate: (tag: ShapeTag) => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name, color: { font: [255, 255, 255], background: [100, 100, 100, 255], border: [100, 100, 100, 255] } });
    setName("");
  };
  return (
    <div className={style.newTagRow}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag" className={style.textField} />
      <button type="button" onClick={submit} className={style.smallButton}>+</button>
    </div>
  );
}

function SaveTemplateRow({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onSave(name);
    setName("");
  };
  return (
    <div className={style.newTagRow}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save current style as..." className={style.textField} />
      <button type="button" onClick={submit} className={style.smallButton}>+</button>
    </div>
  );
}
