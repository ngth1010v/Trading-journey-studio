import { useEffect, useState, useRef } from "react";
import type StateData from "../../../../state/StateData";
import style from "./StrategyFloatingBar.module.css";
import ThemeData, { type Theme } from "../../../../../../../data/theme/ThemeData";
import SeasonFloatingBarIcon from "../../../../../../../../assets/icons/app-window.svg?react";

export default function StrategyFloatingBar({ state }: { state: StateData }) {
    const [openSeasonFloatingBar, setOpenSeasonFloatingBar] = useState(false);

    useEffect(() => {
        const listenerId = "[interface][navigation][strategy][floatingNavigation][StrategyFloatingBar.tsx] config loader";

        state.config.addOnConfigDataChange(
            listenerId,
            ["floatingBar", "seasonBar"],
            () => {
                const seasonOpening = state.config.get()?.floatingBar?.seasonBar?.enable;
                setOpenSeasonFloatingBar(Boolean(seasonOpening));
            }
        );

        return () => {
            state.config.removeOnConfigDataChange(listenerId);
        };
    }, [state]);

    const themeDataRef = useRef<ThemeData>(new ThemeData());
    const [theme, setTheme] = useState<Theme | null>(null);

    useEffect(() => {
        themeDataRef.current.init();

        const listenerId = "[interface][navigation][strategy][floatingNavigation][StrategyFloatingBar.tsx] theme loader";

        themeDataRef.current.addOnSelectedThemeDataChange(listenerId, () =>
            setTheme(themeDataRef.current.getSelected())
        );

        return () => {
            themeDataRef.current.removeOnSelectedThemeDataChange(listenerId);
            themeDataRef.current.destroy();
        };
    }, [state]);

    const themeVars = theme
        ? ({
              "--bg-normal": `rgb(${theme.button.normal1.background.join(",")})`,
              "--font-normal": `rgb(${theme.button.normal1.font.join(",")})`,
              "--bg-active": `rgb(${theme.button.primary1.background.join(",")})`,
              "--font-active": `rgb(${theme.button.primary1.font.join(",")})`,
              "--bg-hover": `rgb(${theme.button.primary2.background.join(",")})`,
              "--font-hover": `rgb(${theme.button.primary2.font.join(",")})`,
          } as React.CSSProperties)
        : {};

    return (
        <div>
            <div
                className={`${style.Button} ${openSeasonFloatingBar ? style.active : ""}`}
                style={themeVars}
                onClick={() =>
                    state.config.set({
                        floatingBar: { seasonBar: { enable: !openSeasonFloatingBar } },
                    })
                }
            >
                <SeasonFloatingBarIcon />
            </div>
        </div>
    );
}