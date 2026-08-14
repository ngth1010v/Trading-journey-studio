import { PageElement, PageElementRow } from "./pageElement.model.js";
import { pageElementRepository } from "./pageElement.repository.js";

export class PageElementService {
  private mapRowToModel(row: PageElementRow): PageElement {
    return {
      id: row.id,
      parentId: row.parentId ?? null,
      entry: Boolean(row.entry),
      entryName: row.entryName,
      type: row.type,
      position: typeof row.position === "string" ? JSON.parse(row.position) : row.position,
      size: typeof row.size === "string" ? JSON.parse(row.size) : row.size,
    };
  }

  public getAllElements(): PageElement[] {
    const rows = pageElementRepository.findAll();
    return rows.map((row) => this.mapRowToModel(row));
  }

  public getElementById(id: number): PageElement | null {
    const row = pageElementRepository.findById(id);
    return row ? this.mapRowToModel(row) : null;
  }

  public saveElement(data: PageElement): { status: number; data?: { id: number }; error?: string } {
    // Create Mode: id is undefined
    if (data.id === undefined || data.id === null) {
      const newId = pageElementRepository.create({
        parentId: data.parentId ?? null,
        entry: data.entry ?? false,
        entryName: data.entryName || "",
        type: data.type,
        position: data.position,
        size: data.size,
      });
      return { status: 200, data: { id: newId } };
    }

    // Update Mode: id provided
    const existing = pageElementRepository.findById(data.id);
    if (!existing) {
      return { status: 404, error: "PageElement not found" };
    }

    // Reject attempt to mutate immutable 'entry' property
    const existingEntryBool = Boolean(existing.entry);
    if (data.entry !== undefined && data.entry !== existingEntryBool) {
      return {
        status: 400,
        error: "Field 'entry' is immutable and cannot be changed after creation",
      };
    }

    const updated = pageElementRepository.update({
      id: data.id,
      parentId: data.parentId ?? null,
      entry: existingEntryBool,
      entryName: data.entryName ?? existing.entryName,
      type: data.type,
      position: data.position,
      size: data.size,
    });

    if (!updated) {
      return { status: 500, error: "Failed to update PageElement" };
    }

    return { status: 200, data: { id: data.id } };
  }

  public deleteElement(id: number): { status: number; message?: string; error?: string } {
    const existing = pageElementRepository.findById(id);
    if (!existing) {
      return { status: 404, error: "PageElement not found" };
    }

    // Restrict deletion if children exist
    const childCount = pageElementRepository.countChildren(id);
    if (childCount > 0) {
      return {
        status: 400,
        error: `Cannot delete element ${id} because it has ${childCount} child element(s)`,
      };
    }

    const deleted = pageElementRepository.delete(id);
    if (!deleted) {
      return { status: 500, error: "Failed to delete PageElement" };
    }

    return { status: 200, message: "PageElement deleted successfully" };
  }

  public getConfig(id: number): { status: number; config?: any; error?: string } {
    const existing = pageElementRepository.findById(id);
    if (!existing) {
      return { status: 404, error: "PageElement not found" };
    }

    const rawConfig = pageElementRepository.getConfig(id);
    const config = rawConfig ? JSON.parse(rawConfig) : null;
    return { status: 200, config };
  }

  public setConfig(id: number, configData: any): { status: number; message?: string; error?: string } {
    const existing = pageElementRepository.findById(id);
    if (!existing) {
      return { status: 404, error: "PageElement not found" };
    }

    pageElementRepository.setConfig(id, configData);
    return { status: 200, message: "Config updated successfully" };
  }
}

export const pageElementService = new PageElementService();