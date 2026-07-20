import { Theme, DEFAULT_THEME, PartialTheme } from './theme.model.js';
import { ThemeRepository } from './theme.repository.js';

export class ThemeService {
    constructor(private repo: ThemeRepository) {}

    getAll(): Theme[] {
        return this.repo.getAllThemes();
    }

    getChangedThemesSince(timestamp: number): number[] {
        return this.repo.getChangedThemeIds(timestamp);
    }

    save(id: number, incomingData: PartialTheme): Theme {
        // Intercept updates targeting the default theme archetype profile parameters 
        if (id === 0) {
            const keys = Object.keys(incomingData).filter(k => k !== 'selected');
            if (keys.length > 0) {
                throw new Error("Cannot modify configuration items on the template 'Default' theme except for the 'selected' field.");
            }
            
            const existingDefault = this.repo.getThemeById(0) || DEFAULT_THEME;
            const mergedDefault: Theme = {
                ...existingDefault,
                selected: incomingData.selected ?? existingDefault.selected
            };
            
            return this.repo.saveTheme(mergedDefault, Date.now());
        }

        const existingTheme = this.repo.getThemeById(id);
        const selected = incomingData.selected ?? false;

        let mergedTheme: Theme;

        if (existingTheme) {
            mergedTheme = this.deepMerge({}, existingTheme, incomingData) as Theme;
        } else {
            if (!incomingData.name || incomingData.name.trim() === "") {
                throw new Error("Validation failed: Theme name is required for new themes.");
            }
            mergedTheme = this.deepMerge({}, DEFAULT_THEME, incomingData) as Theme;
            // Clear baseline seed reference IDs to allow SQLite autoincrement actions to naturally hook in
            delete mergedTheme.id; 
        }

        if (mergedTheme.name.toLowerCase() === "default") {
            throw new Error("Validation failed: Custom themes cannot be named 'Default'.");
        }

        mergedTheme.selected = selected;
        if (existingTheme) {
            mergedTheme.id = id;
        }

        return this.repo.saveTheme(mergedTheme, Date.now());
    }

    delete(id: number): void {
        if (id === 0) {
            throw new Error("Cannot delete the template 'Default' theme.");
        }

        const targetTheme = this.repo.getThemeById(id);
        if (!targetTheme) {
            throw new Error(`Theme with ID '${id}' does not exist.`);
        }

        this.repo.deleteTheme(id);
    }

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