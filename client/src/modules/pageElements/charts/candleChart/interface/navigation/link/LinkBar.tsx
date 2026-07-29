import { useEffect, useState, useId } from "react";
import style from "./LinkBar.module.css";

import type StateData from "../../../state/StateData";
import ThemeData from "../../../../../../data/theme/ThemeData";
import type { Link } from "../../../state/viewport/link/LinkData";
import type { RGB, RGBA } from "../../../../../../shared/type";

import ButtonWithPopover from "../../../../../../shared/components/ButtonWithPopover";
import ListWithTheme from "../../../../../../shared/components/ListWithTheme";

/**
 * Converts RGB or RGBA array tuple/array into valid CSS color string.
 * Example: [255, 0, 0] -> "rgb(255,0,0)"
 * Example: [255, 0, 0, 255] -> "rgba(255,0,0,1)" or "rgba(255,0,0,255)"
 */
function formatColor(color: RGB | RGBA | string | undefined): string | undefined {
    if (!color) return undefined;
    if (typeof color === "string") return color;

    if (Array.isArray(color)) {
        if (color.length === 3) {
            return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        }
        if (color.length === 4) {
            // If alpha is provided on a 0-255 scale, convert to 0-1 range for standard css rgba
            const alpha = color[3] > 1 ? color[3] / 255 : color[3];
            return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
        }
    }
    return undefined;
}

export default function LinkBar({ state }: { state: StateData }) {
    const [, forceUpdate] = useState(0);
    const listenerId = useId();

    const [themeData] = useState(() => new ThemeData());
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        themeData.init();

        const handleThemeChange = () => {
            forceUpdate((v) => v + 1);
        };

        const handleConfigChange = () => {
            forceUpdate((v) => v + 1);
        };

        const handleLinkChange = () => {
            setIsCreating(false);
            forceUpdate((v) => v + 1);
        };

        themeData.addOnSelectedThemeDataChange(listenerId, handleThemeChange);
        state.config.addOnConfigDataChange(listenerId, ["data"], handleConfigChange);
        state.viewport.link.addOnLinkDataChange(listenerId, handleLinkChange);

        return () => {
            themeData.removeOnSelectedThemeDataChange(listenerId);
            state.config.removeOnConfigDataChange(listenerId);
            state.viewport.link.removeOnLinkDataChange(listenerId);
            themeData.destroy();
        };
    }, [state, themeData, listenerId]);

    // 1. Get current linkId from state config
    let configData;
    try {
        configData = state.config.get().data;
    } catch {
        configData = undefined;
    }

    const linkId = configData?.linkId ?? null;
    const isConnected = linkId !== null && linkId !== undefined;

    // 2. Fetch selected Link object if connected
    let currentLink: Link | null = null;
    if (isConnected) {
        try {
            currentLink = state.viewport.link.get(linkId);
        } catch {
            currentLink = null;
        }
    }

    // 3. Fetch all available links
    const allLinks = state.viewport.link.getAll();

    const handleCreateNewLink = async () => {
        setIsCreating(true);
        try {
            const defaultLink = state.viewport.link.getDefault();
            await state.viewport.link.set(defaultLink);
        } catch (err) {
            console.error("LinkBar: Failed to create default link", err);
            setIsCreating(false);
        }
    };

    return (
        <ListWithTheme
            autoShrink
            type="horizontal"
            dividerList={[true, false]}
        >
            {/* LEFT PART: STATUS */}
            <div
                className={style.StatusContainer}
                style={{ opacity: isConnected ? 1 : 0.5 }}
            >
                <span
                    className={`${style.dot} ${
                        isConnected ? style.dotConnected : style.dotNotConnected
                    }`}
                />
                <span>{isConnected ? "Connected" : "Not connected"}</span>
            </div>

            {/* RIGHT PART: SELECTED LINK SELECTOR */}
            <ButtonWithPopover
                type="hover"
                position="bottom"
                align="start"
                bufferSize="10px"
                button={
                    <div
                        className={style.SelectedLinkButton}
                        style={{
                            opacity: currentLink ? 1 : 0.5,
                            backgroundColor: currentLink
                                ? formatColor(currentLink.color.background)
                                : "transparent",
                            color: currentLink
                                ? formatColor(currentLink.color.font)
                                : "inherit",
                        }}
                    >
                        <span
                            className={style.dot}
                            style={{
                                backgroundColor: currentLink
                                    ? formatColor(currentLink.color.border)
                                    : "var(--color-gray, #888888)",
                            }}
                        />
                        <span>{currentLink ? currentLink.name : "---"}</span>
                    </div>
                }
                popup={
                    <ListWithTheme
                        selectedList={[
                            linkId === null,
                            ...allLinks.map((item) => item.id === linkId),
                            ...(isCreating ? [false] : []),
                            false, // '+' button item is never 'selected'
                        ]}
                        maxHeight="40vh"
                    >
                        {/* Option 1: No Connection */}
                        <div
                            className={style.PopupButton}
                            style={{ width: "100%", opacity: 0.7 }}
                            onClick={() => {
                                state.config.set({ data: { linkId: null } });
                            }}
                        >
                            <span
                                className={`${style.dot} ${style.dotNotConnected}`}
                            />
                            <span>No connection</span>
                        </div>

                        {/* Option 2..N: Available Links */}
                        {allLinks.map((link) => (
                            <div
                                key={link.id ?? link.name}
                                className={style.PopupButton}
                                style={{
                                    width: "100%",
                                    backgroundColor: formatColor(
                                        link.color.background
                                    ),
                                    color: formatColor(link.color.font),
                                }}
                                onClick={() => {
                                    if (link.id !== undefined) {
                                        state.config.set({
                                            data: { linkId: link.id },
                                        });
                                    }
                                }}
                            >
                                <span
                                    className={style.dot}
                                    style={{
                                        backgroundColor: formatColor(
                                            link.color.border
                                        ),
                                    }}
                                />
                                <span>{link.name}</span>
                            </div>
                        ))}

                        {/* Placeholder item when creating new row */}
                        {isCreating && (
                            <div
                                className={style.PopupButton}
                                style={{ width: "100%", opacity: 0.5 }}
                            >
                                <span
                                    className={`${style.dot} ${style.dotNotConnected}`}
                                />
                                <span>---</span>
                            </div>
                        )}

                        {/* Option N+1: Create New Link */}
                        <div
                            className={`${style.PopupButton} ${style.AddButton}`}
                            style={{ width: "100%" }}
                            onClick={handleCreateNewLink}
                        >
                            <span>+</span>
                        </div>
                    </ListWithTheme>
                }
            />
        </ListWithTheme>
    );
}