import React, { useEffect, useState, useRef } from "react";
import style from "./linkCrosshairBar.module.css";

import type StateData from "../../../../state/StateData";
import type { Config } from "../../../../state/config/ConfigData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import PanelInput from "../../../../../../../input/panel/PanelInput";
import CrosshairSyncIcon from "../../../../../../../../assets/icons/cursor-fill.svg?react";

export const LINK_CROSSHAIR_INPUT_LAYOUT = {
    enable: "boolean",
    style: {
        color: {
            background: "rgba",
            font: "rgb",
        },
        thickness: "uNumber",
        type: "dlineType",
        dash: {
            space: "uNumber", //px
            width: "uNumber", //px
        },
    },
};

type CrosshairConfig = NonNullable<NonNullable<Config["sync"]>["crosshair"]>;

interface LinkCrosshairBarProps {
    state: StateData;
}

const toCssColor = (color?: number[]) => {
    if (!color) return undefined;
    if (color.length === 4) return `rgba(${color.join(",")})`;
    return `rgb(${color.join(",")})`;
};

interface LinkCrosshairFormProps {
    initialData?: CrosshairConfig;
    theme: Theme | null;
    state: StateData;
}

function LinkCrosshairForm({ initialData, theme, state }: LinkCrosshairFormProps) {
    const [formData, setFormData] = useState<CrosshairConfig>(initialData ?? {});

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
                crosshair: formData,
            },
        });
    };

    return (
        <PanelInput
            layout={LINK_CROSSHAIR_INPUT_LAYOUT}
            data={formData}
            onDataChange={(updatedData) => setFormData(updatedData as CrosshairConfig)}
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

export default function LinkCrosshairBar({ state }: LinkCrosshairBarProps) {
    const listenerIds = {
        theme: "[candleChart][interface][navigation][sync][linkCrosshair][LinkCrosshairBar] Theme-listener",
        crosshairConfig: "[candleChart][interface][navigation][sync][linkCrosshair][LinkCrosshairBar] Config-listener",
    };

    const themeDataRef = useRef<ThemeData>(new ThemeData());

    const [theme, setTheme] = useState<Theme | null>(null);
    const [crosshairConfig, setCrosshairConfig] = useState<CrosshairConfig | undefined>(
        state.config.get()?.sync?.crosshair
    );
    const [isOpen, setIsOpen] = useState<boolean>(false);

    useEffect(() => {
        themeDataRef.current.init();

        themeDataRef.current.addOnSelectedThemeDataChange(listenerIds.theme, () =>
            setTheme(themeDataRef.current.getSelected())
        );

        state.config.addOnConfigDataChange(listenerIds.crosshairConfig, ["sync"], () => {
            setCrosshairConfig(state.config.get()?.sync?.crosshair);
        });

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIds.theme);
            themeDataRef.current.destroy();

            state.config.removeOnConfigDataChange(listenerIds.crosshairConfig);
        };
    }, [state]);

    const isEnabled = crosshairConfig?.enable ?? false;
    const iconFill = isEnabled
        ? toCssColor(crosshairConfig?.style?.color?.background)
        : theme
        ? toCssColor(theme.button.disable.font)
        : undefined;

    const buttonContent = (
        <div className={style.Button}>
            <CrosshairSyncIcon style={{ fill: iconFill, width: 12, height: 12 }} />
        </div>
    );

    const popoverContent = (
        <LinkCrosshairForm
            initialData={crosshairConfig}
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