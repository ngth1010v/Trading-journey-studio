import type { RGB, RGBA } from "../../type.js";

type BBF  = { background: RGBA, border: RGBA, font: RGB };

export interface Theme {
    id             ?: number;
    name            : string;
    selected        : boolean;
    background      : RGBA;

    // Panel
    panel: {
        primary1: BBF;
        primary2: BBF;
        normal1 : BBF;
        normal2 : BBF;
        danger  : BBF;
        success : BBF;
        warning : BBF;
        disable : BBF;
    };
    
    // Button
    button: {
        primary1: BBF;
        primary2: BBF;
        normal1 : BBF;
        normal2 : BBF;
        danger  : BBF;
        success : BBF;
        warning : BBF;
        disable : BBF;
    };

    // Chart
    chart: {
        grid     : RGBA;
        crosshair: RGBA;
    };
}

export type PartialTheme = {
    id?: number;
    name?: string;
    selected?: boolean;
    background?: RGBA;
    panel?: Partial<Record<keyof Theme['panel'], Partial<BBF>>>;
    button?: Partial<Record<keyof Theme['button'], Partial<BBF>>>;
    chart?: Partial<Theme['chart']>;
};