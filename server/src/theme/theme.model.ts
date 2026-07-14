type RGB  = [number, number, number];
type RGBA = [number, number, number, number];
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
    background: [10, 11, 18, 1],

    // Panel
    panel: {
        primary1: {
            background: [35, 55, 95, 1],
            border:     [77, 163, 255, 1],
            font:       [245, 248, 255],
        },
        primary2: {
            background: [23, 34, 58, 1],
            border:     [55, 120, 200, 1],
            font:       [225, 235, 255],
        },
        normal1: {
            background: [28, 30, 42, 1],
            border:     [60, 64, 82, 1],
            font:       [240, 240, 245],
        },
        normal2: {
            background: [20, 22, 32, 1],
            border:     [42, 46, 60, 1],
            font:       [215, 220, 230],
        },
        danger: {
            background: [65, 18, 38, 1],
            border:     [255, 85, 125, 1],
            font:       [255, 235, 240],
        },
        success: {
            background: [18, 55, 45, 1],
            border:     [45, 255, 170, 1],
            font:       [230, 255, 245],
        },
        disable: {
            background: [24, 24, 28, 1],
            border:     [45, 45, 52, 1],
            font:       [110, 110, 120],
        },
    },

    // Button
    button: {
        primary1: {
            background: [77, 163, 255, 1],
            border:     [130, 195, 255, 1],
            font:       [255, 255, 255],
        },
        primary2: {
            background: [255, 79, 216, 1],
            border:     [255, 145, 230, 1],
            font:       [255, 255, 255],
        },
        normal1: {
            background: [34, 37, 50, 1],
            border:     [70, 75, 95, 1],
            font:       [240, 240, 245],
        },
        normal2: {
            background: [24, 26, 36, 1],
            border:     [52, 56, 70, 1],
            font:       [215, 220, 230],
        },
        danger: {
            background: [255, 76, 119, 1],
            border:     [255, 130, 160, 1],
            font:       [255, 255, 255],
        },
        success: {
            background: [40, 220, 150, 1],
            border:     [110, 255, 195, 1],
            font:       [10, 18, 14],
        },
        disable: {
            background: [36, 38, 46, 1],
            border:     [55, 58, 68, 1],
            font:       [120, 122, 130],
        },
    },

    // Chart
    chart: {
        grid:      [42, 46, 60, 0.45],
        crosshair: [77, 163, 255, 0.75],
    },
};