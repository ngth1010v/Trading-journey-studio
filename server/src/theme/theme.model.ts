import type { RGB, RGBA } from "../shared/type.js";

type BBF  = { background: RGBA, border: RGBA, font: RGB };

export interface Theme {
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
        disable : BBF;
    };

    // Chart
    chart: {
        grid     : RGBA;
        crosshair: RGBA;
    };
}

// Deep Partial helper type for permissive validation/merging
export type PartialTheme = {
    name?: string;
    selected?: boolean;
    background?: RGBA;
    panel?: Partial<Record<keyof Theme['panel'], Partial<BBF>>>;
    button?: Partial<Record<keyof Theme['button'], Partial<BBF>>>;
    chart?: Partial<Theme['chart']>;
};

export const DEFAULT_THEME: Theme = {
    name: "Default",
    selected: true,
    background: [13, 16, 23, 1],

    // Panel
    panel: {
        primary1: {
            background: [32, 43, 67, 1],
            border:     [82, 118, 175, 1],
            font:       [238, 242, 248],
        },
        primary2: {
            background: [24, 32, 50, 1],
            border:     [67, 96, 145, 1],
            font:       [225, 231, 240],
        },
        normal1: {
            background: [30, 33, 42, 1],
            border:     [55, 60, 74, 1],
            font:       [235, 238, 242],
        },
        normal2: {
            background: [22, 25, 32, 1],
            border:     [42, 46, 58, 1],
            font:       [210, 216, 225],
        },
        danger: {
            background: [58, 28, 34, 1],
            border:     [145, 82, 90, 1],
            font:       [245, 235, 236],
        },
        success: {
            background: [24, 50, 46, 1],
            border:     [74, 145, 130, 1],
            font:       [235, 245, 242],
        },
        disable: {
            background: [25, 27, 32, 1],
            border:     [42, 45, 52, 1],
            font:       [115, 120, 128],
        },
    },

    // Button
    button: {
        primary1: {
            background: [72, 105, 160, 1],
            border:     [98, 132, 188, 1],
            font:       [248, 249, 250],
        },
        primary2: {
            background: [120, 90, 150, 1],
            border:     [145, 118, 175, 1],
            font:       [248, 248, 250],
        },
        normal1: {
            background: [38, 42, 52, 1],
            border:     [60, 66, 78, 1],
            font:       [235, 238, 242],
        },
        normal2: {
            background: [28, 31, 38, 1],
            border:     [48, 52, 62, 1],
            font:       [215, 220, 228],
        },
        danger: {
            background: [150, 70, 78, 1],
            border:     [175, 95, 104, 1],
            font:       [250, 250, 250],
        },
        success: {
            background: [58, 130, 118, 1],
            border:     [84, 156, 143, 1],
            font:       [248, 250, 249],
        },
        disable: {
            background: [34, 36, 42, 1],
            border:     [50, 54, 62, 1],
            font:       [120, 124, 132],
        },
    },

    // Chart
    chart: {
        grid:      [52, 56, 68, 0.35],
        crosshair: [112, 142, 190, 0.65],
    },
};