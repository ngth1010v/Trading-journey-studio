import { Theme, DEFAULT_THEME, PartialTheme } from './theme.model.js';
import { ThemeRepository } from './theme.repository.js';

export class ThemeService {
    constructor(private repo: ThemeRepository) {}

    getAll(): Theme[] {
        const dbThemes = this.repo.getAllThemes();
        const hasCustomSelection = dbThemes.some(t => t.selected);

        // Compute runtime default theme variant state
        const runtimeDefault: Theme = {
            ...DEFAULT_THEME,
            selected: !hasCustomSelection
        };

        return [runtimeDefault, ...dbThemes];
    }

    save(name: string, incomingData: PartialTheme): Theme {
        if (!name || name.trim() === "") {
            throw new Error("Theme name is required.");
        }
        if (name.toLowerCase() === "default") {
            throw new Error("Cannot modify or create a theme named 'Default'.");
        }

        const existingTheme = this.repo.getThemeByName(name);
        const selected = incomingData.selected ?? false;

        let mergedTheme: Theme;

        if (existingTheme) {
            // Fill missing structural pieces via previous item fallback strategy
            mergedTheme = this.deepMerge({}, existingTheme, incomingData) as Theme;
        } else {
            // Fill missing structural pieces via base Default fallback strategy
            mergedTheme = this.deepMerge({}, DEFAULT_THEME, incomingData) as Theme;
        }

        // enforce explicit primary rules overrides
        mergedTheme.name = name;
        mergedTheme.selected = selected;

        if (selected) {
            this.repo.clearAllSelections();
        }

        this.repo.saveTheme(mergedTheme);

        return mergedTheme;
    }

    delete(name: string): void {
        if (name.toLowerCase() === "default") {
            throw new Error("Cannot delete the template 'Default' theme.");
        }

        const targetTheme = this.repo.getThemeByName(name);
        if (!targetTheme) {
            throw new Error(`Theme '${name}' does not exist.`);
        }

        this.repo.deleteTheme(name);
    }

    // Comprehensive structural dynamic helper object deep merging
    private deepMerge(target: any, ...sources: any[]): any {
        for (const source of sources) {
            if (!source) continue;
            for (const key of Object.keys(source)) {
                if (Array.isArray(source[key])) {
                    target[key] = [...source[key]];
                } else if (source[key] && typeof source[key] === 'object') {
                    if (!target[key]) target[key] = {};
                    this.deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
        return target;
    }
}