export type RGB  = [number, number, number];
export type RGBA = [number, number, number, number];
export type BBF  = { background: RGBA; border: RGBA; font: RGB };

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

export type PartialTheme = {
    name?: string;
    selected?: boolean;
    background?: RGBA;
    panel?: Partial<Record<keyof Theme['panel'], Partial<BBF>>>;
    button?: Partial<Record<keyof Theme['button'], Partial<BBF>>>;
    chart?: Partial<Theme['chart']>;
};

export interface ThemeDataContextType {
    getSelectedName: () => string;
    get: (themeName: string) => Theme | undefined;
    getAll: () => Theme[];
    set: (themeName: string, theme: PartialTheme) => Promise<void>;
    addOnSelectedThemeChange: (id: string, callback: (theme: Theme) => void) => void;
    removeOnSelectedThemeChange: (id: string) => void;
}