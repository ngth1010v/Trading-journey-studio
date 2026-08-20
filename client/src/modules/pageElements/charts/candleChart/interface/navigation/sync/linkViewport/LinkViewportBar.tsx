
import React, { useEffect, useState, useRef } from "react";
import style from "./linkViewportBar.module.css";

import type StateData from "../../../../state/StateData";
import type { Config } from "../../../../state/config/ConfigData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import PanelInput from "../../../../../../../input/panel/PanelInput";
import ViewportSyncIcon  from "../../../../../../../../assets/icons/vibrate-fill.svg?react"


export const LINK_VIEWPORT_INPUT_LAYOUT = {
    enable: "boolean",
    extend:{
        top     : "uNumber",
        bottom  : "uNumber",
        left    : "uNumber",
        right   : "uNumber",
    },
    style:{
        background: "rgba",   
        border: {
            color: "rgba",
            thickness: "uNumber",
            type: "lineType",
            dash: {
                space: "uNumber", //px
                width: "uNumber", //px
            }
        }     
    }
};

type ViewportConfig = NonNullable<NonNullable<Config["sync"]>["viewport"]>;

interface LinkViewportBarProps {
    state: StateData;
}

const toCssColor = (color?: number[]) => {
    if (!color) return undefined;
    if (color.length === 4) return `rgba(${color.join(",")})`;
    return `rgb(${color.join(",")})`;
};

interface LinkViewportFormProps {
    initialData?: ViewportConfig;
    theme: Theme | null;
    state: StateData;
}

function LinkViewportForm({ initialData, theme, state }: LinkViewportFormProps) {
    const [formData, setFormData] = useState<ViewportConfig>(initialData ?? {});

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const saveStyle = {
        "--bg-default": toCssColor(theme?.button.primary2.background),
        "--color-default": toCssColor(theme?.button.primary2.font),
        "--bg-hover": toCssColor(theme?.button.primary1.background),
        "--color-hover": toCssColor(theme?.button.primary1.font),
    } as React.CSSProperties;

    const handleSave = () => {
        const currentSync = state.config.get()?.sync;
        state.config.set({
            sync: {
                ...currentSync,
                viewport: formData,
            },
        });
    };

    return (
        <PanelInput
            layout={LINK_VIEWPORT_INPUT_LAYOUT}
            data={formData}
            onDataChange={(updatedData) => setFormData(updatedData as ViewportConfig)}
            footer={
                <div className={style.Footer}>
                    <div
                        className={style.SaveButton}
                        style={saveStyle}
                        onClick={handleSave}
                    >
                        Save
                    </div>
                </div>
            }
        />
    );
}

export default function LinkViewportBar({ state }: LinkViewportBarProps) {
    const listenerIds = {
        theme: "[candleChart][interface][navigation][sync][linkViewport][LinkViewportBar] Theme-listener",
        viewportConfig: "[candleChart][interface][navigation][sync][linkViewport][LinkViewportBar] Config-listener",
    };

    const themeDataRef = useRef<ThemeData>(new ThemeData());

    const [theme, setTheme] = useState<Theme | null>(null);
    const [viewportConfig, setViewportConfig] = useState<ViewportConfig | undefined>(
        state.config.get()?.sync?.viewport
    );
    const [isOpen, setIsOpen] = useState<boolean>(false);

    useEffect(() => {
        themeDataRef.current.init();

        themeDataRef.current.addOnSelectedThemeDataChange(listenerIds.theme, () =>
            setTheme(themeDataRef.current.getSelected())
        );

        state.config.addOnConfigDataChange(listenerIds.viewportConfig, ["sync"], () => {
            setViewportConfig(state.config.get()?.sync?.viewport);
        });

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIds.theme);
            themeDataRef.current.destroy();

            state.config.removeOnConfigDataChange(listenerIds.viewportConfig);
        };
    }, [state]);

    const isEnabled = viewportConfig?.enable ?? false;
    const iconFill = isEnabled
        ? toCssColor(viewportConfig?.style?.background)
        : theme
        ? toCssColor(theme.button.disable.font)
        : undefined;

    const buttonContent = (
        <div className={style.Button}>
            <ViewportSyncIcon style={{ fill: iconFill, width: 12, height: 12 }} />
        </div>
    );

    const popoverContent = (
        <LinkViewportForm
            initialData={viewportConfig}
            theme={theme}
            state={state}
        />
    );

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="7px"
            open={isOpen}
            setOpen={setIsOpen}
            button={buttonContent}
            popup={popoverContent}
        />
    );
}