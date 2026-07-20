import { Theme, PartialTheme } from './theme.model.js';
import { ThemeRepository } from './theme.repository.js';

export class ThemeService {
    constructor(private repo: ThemeRepository) {}

    getAll(): Theme[] {
        return this.repo.getAllThemes();
    }

    save(id: number, incomingData: PartialTheme): Theme {
        const existingTheme = this.repo.getThemeById(id);
        const selected = incomingData.selected ?? false;

        let mergedTheme: Theme;

        if (existingTheme) {
            mergedTheme = this.deepMerge({}, existingTheme, incomingData) as Theme;
            mergedTheme.id = id;
        } else {
            if (!incomingData.name || incomingData.name.trim() === "") {
                throw new Error("Validation failed: Theme name is required for new themes.");
            }
            // Strip out ID so SQLite assigns a new auto-incrementing key naturally
            mergedTheme = { ...incomingData } as Theme;
            delete mergedTheme.id;
        }

        mergedTheme.selected = selected;

        return this.repo.saveTheme(mergedTheme, Date.now());
    }

    delete(id: number): void {
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