import { ColorRepository } from "./color.repository.js";
import type { Color } from "./color.model.js";
import type { RGBA } from "../shared/type.js";

export class ColorService {
  constructor(private repo: ColorRepository) {}

  public validateRGBA(color: unknown): color is RGBA {
    if (!Array.isArray(color) || color.length !== 4) return false;
    return color.every(num => typeof num === 'number' && num >= 0 && num <= 255);
  }

  public getAllColors(): Color[] {
    const rows = this.repo.getAllSorted();
    return rows.map(row => ({
      id: row.id,
      color: JSON.parse(row.color) as RGBA
    }));
  }

  public saveColor(colorData: Partial<Color>): { success: boolean; data: {id: number} } {
    if (!this.validateRGBA(colorData.color)) {
      throw new Error("Invalid RGBA format. Must be an array of 4 numbers [0-255].");
    }

    const colorJson = JSON.stringify(colorData.color);
    const timestamp = Date.now();

    // Update if ID exists, otherwise create
    if (colorData.id !== undefined && colorData.id !== null) {
      const existing = this.repo.getById(colorData.id);
      if (existing) {
        this.repo.update(colorData.id, colorJson, timestamp);
        return { success: true, data: {id: colorData.id }};
      }
    }

    const newId = this.repo.create(colorJson, timestamp);
    return { success: true, data: {id: newId} };
  }

  public deleteColor(id: number): boolean {
    return this.repo.delete(id);
  }
}