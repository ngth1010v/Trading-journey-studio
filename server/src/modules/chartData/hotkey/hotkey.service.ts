import { HotkeyRepository } from "./hotkey.repository.js";
import { Hotkey } from "./hotkey.model.js";

export class HotkeyService {
  constructor(private repo: HotkeyRepository) {}

  public getHotkeysByChart(chartType: string): Hotkey[] {
    return this.repo.getByChartType(chartType);
  }

  public saveHotkey(hotkey: Hotkey): { id: number } | null {
    const data = {
      chartType: hotkey.chartType,
      keys: hotkey.keys,
      actions: hotkey.actions
    };

    if (hotkey.id !== undefined) {
      const existing = this.repo.getById(hotkey.id);
      if (!existing) {
        return null; // Signals a 404 status condition
      }
      this.repo.update(hotkey.id, data);
      return { id: hotkey.id };
    } else {
      const newId = this.repo.create(data);
      return { id: newId };
    }
  }

  public deleteHotkey(id: number): boolean {
    return this.repo.delete(id);
  }
}