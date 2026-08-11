import React, { useEffect, useState, useRef } from "react";
import style from "./LinkBar.module.css";

import type StateData from "../../../../state/StateData";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import ButtonWithPopover from "../../../../../../../shared/components/ButtonWithPopover";
import ViewportSyncIcon from "../../../../../../../../assets/icons/arrows-left-right-fill.svg?react";
import ScrollVerticalList from "../../../../../../../shared/components/list/ScrollVerticalList";
import PanelInput from "../../../../../../../input/panel/PanelInput";
import { type Link, LINK_INPUT_LAYOUT, type LinkMode } from "../../../../state/sync/link/LinkData";

interface LinkBarProps {
    state: StateData;
}

const toCssColor = (color?: number[]) => {
    if (!color) return undefined;
    if (color.length === 4) return `rgba(${color.join(",")})`;
    return `rgb(${color.join(",")})`;
};

interface LinkPanelFormProps {
    initialData: Link;
    theme: Theme | null;
    state: StateData;
}

function LinkPanelForm({ initialData, theme, state }: LinkPanelFormProps) {
    const [formData, setFormData] = useState<Link>(initialData);

    useEffect(() => {
        setFormData(initialData);
    }, [initialData]);

    const saveStyle = {
        "--bg-default": toCssColor(theme?.button.primary2.background),
        "--color-default": toCssColor(theme?.button.primary2.font),
        "--bg-hover": toCssColor(theme?.button.primary1.background),
        "--color-hover": toCssColor(theme?.button.primary1.font),
    } as React.CSSProperties;

    return (
        <PanelInput
            layout={LINK_INPUT_LAYOUT}
            data={formData}
            onDataChange={(updatedData) => setFormData(updatedData as Link)}
            footer={
                <div className={style.Footer}>
                    <div
                        className={style.SaveButton}
                        style={saveStyle}
                        onClick={() => {
                            const handleSave = async () => {
                                const res = await state.sync.link.set(formData);
                                console.log(res);
                            };
                            handleSave();
                        }}
                    >
                        Save
                    </div>
                </div>
            }
        />
    );
}

export default function LinkBar({ state }: LinkBarProps) {
    const listenerIds = {
        theme: "[candleChart][interface][navigation][sync][link][LinkBar] Theme-listener",
        linkData: "[candleChart][interface][navigation][sync][link][LinkBar] LinkData-listener",
        linkModeData: "[candleChart][interface][navigation][sync][link][LinkBar] LinkModeData-listener",
        currentLinkId: "[candleChart][interface][navigation][sync][link][LinkBar] CurrentLinkId-listener",
    };

    const themeDataRef = useRef<ThemeData>(new ThemeData());

    const [theme, setTheme] = useState<Theme | null>(null);
    const [linkList, setLinkList] = useState<Link[] | null>(null);
    const [currentLinkId, setCurrentLinkId] = useState<number | null>(null);
    const [currentSyncMode, setCurrentSyncMode] = useState<LinkMode>("down");

    const [isMainOpen, setIsMainOpen] = useState<boolean>(false);
    const [openPopoverId, setOpenPopoverId] = useState<number | "create" | null>(null);

    useEffect(() => {
        themeDataRef.current.init();

        themeDataRef.current.addOnSelectedThemeDataChange(listenerIds.theme, () =>
            setTheme(themeDataRef.current.getSelected())
        );

        state.sync.link.addOnLinkDataChange(listenerIds.linkData, () => {
            setLinkList(state.sync.link.getAll());
        });

        state.sync.link.addOnLinkModeDataChange(listenerIds.linkModeData, () => {
            setCurrentSyncMode(state.sync.link.getMode());
        });

        state.config.addOnConfigDataChange(listenerIds.currentLinkId, ["sync"], () => {
            setCurrentLinkId(state.config.get()?.sync?.linkId ?? null);
        });

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerIds.theme);
            themeDataRef.current.destroy();

            state.sync.link.removeOnLinkDataChange(listenerIds.linkData);
            state.sync.link.removeOnLinkModeDataChange(listenerIds.linkModeData);
            state.config.removeOnConfigDataChange(listenerIds.currentLinkId);
        };
    }, [state]);

    const handleSelectLink = (id: number | undefined) => {
        const newId = currentLinkId === id ? null : id;
        state.config.set({
            sync: {
                ...state.config.get()?.sync,
                linkId: newId,
            },
        });
    };

    const handleMainOpenChange = (open: boolean | ((prev: boolean) => boolean)) => {
        const nextOpen = typeof open === "function" ? open(isMainOpen) : open;
        setIsMainOpen(nextOpen);
        if (!nextOpen) {
            setOpenPopoverId(null);
        }
    };

    const currentLink = linkList?.find((link) => link.id === currentLinkId);
    const disabledFontColor = theme ? toCssColor(theme.button.disable.font) : undefined;
    const warningFontColor = theme ? toCssColor(theme.button.warning.font) : undefined;
    const successFontColor = theme ? toCssColor(theme.button.success.font) : undefined;

    const buttonContent = (
        <div className={style.Button}>
            {!currentLink || currentLinkId === null ? (
                <div className={style.LeftContent}>
                    <ViewportSyncIcon style={{ fill: disabledFontColor, width: 12, height: 12 }} />
                    <span style={{ color: disabledFontColor }}>No link</span>
                    <span className={style.StatusDot} style={{ backgroundColor: disabledFontColor }} />
                </div>
            ) : (
                <div className={style.LeftContent}>
                    <ViewportSyncIcon
                        style={{
                            fill: toCssColor(currentLink.color?.font),
                            width: 12,
                            height: 12,
                        }}
                    />
                    <span>{currentLink.name}</span>
                    <span
                        className={style.StatusDot}
                        style={{
                            backgroundColor: currentSyncMode === "up" ? successFontColor : warningFontColor,
                        }}
                    />
                </div>
            )}
        </div>
    );

    const selectedList = (linkList ?? []).map((linkItem) => linkItem.id === currentLinkId);

    const popoverContent = (
        <ScrollVerticalList selectedList={selectedList}>
            {(linkList || []).map((linkItem) => {
                return (
                    <ButtonWithPopover
                        key={linkItem.id}
                        type="hover"
                        position="right"
                        align="start"
                        bufferSize="7px"
                        buttonWidth="100%"
                        open={openPopoverId === linkItem.id}
                        setOpen={(isOpen: any) => setOpenPopoverId(isOpen ? (linkItem.id ?? null) : null)}
                        button={
                            <div
                                className={style.PopupButton}
                                onClick={() => handleSelectLink(linkItem.id)}
                            >
                                <div className={style.LeftContent}>
                                    <ViewportSyncIcon
                                        style={{
                                            fill: toCssColor(linkItem.color?.font),
                                            width: 12,
                                            height: 12,
                                        }}
                                    />
                                    <span>{linkItem.name}</span>
                                </div>
                            </div>
                        }
                        popup={
                            <LinkPanelForm
                                initialData={linkItem}
                                theme={theme}
                                state={state}
                            />
                        }
                    />
                );
            })}
            <ButtonWithPopover
                type="hover"
                position="right"
                align="start"
                bufferSize="7px"
                buttonWidth="100%"
                open={openPopoverId === "create"}
                setOpen={(isOpen: any) => setOpenPopoverId(isOpen ? "create" : null)}
                button={<div className={style.CreateRow}>+</div>}
                popup={
                    <LinkPanelForm
                        initialData={state.sync.link.getDefault?.() ?? ({} as Link)}
                        theme={theme}
                        state={state}
                    />
                }
            />
        </ScrollVerticalList>
    );

    return (
        <ButtonWithPopover
            type="hover"
            position="bottom"
            align="start"
            bufferSize="7px"
            open={isMainOpen}
            setOpen={handleMainOpenChange}
            button={buttonContent}
            popup={popoverContent}
        />
    );
}