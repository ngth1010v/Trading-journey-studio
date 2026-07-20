import { PageRepository } from './page.repository.js';
import { Page, PageSummary } from './page.model.js';

export class PageService {
  constructor(private repository: PageRepository) {}

  public getAllPages(): PageSummary[] {
    return this.repository.findAll();
  }

  public getPageById(id: number): Page {
    const page = this.repository.findById(id);
    if (!page) {
      throw new Error(`Page with ID ${id} not found`);
    }
    return page;
  }

  public savePage(pageData: Page): { id: number } {
    // Strict Update/Create Split logic
    if (pageData.id !== undefined) {
      const exists = this.repository.findById(pageData.id);
      if (!exists) {
        throw new Error(`Cannot update: Page with ID ${pageData.id} does not exist`);
      }
      
      this.repository.update(pageData as Required<Page>);
      return { id: pageData.id };
    } else {
      const newId = this.repository.create(pageData);
      return { id: newId };
    }
  }

  public deletePage(id: number): void {
    const deleted = this.repository.delete(id);
    if (!deleted) {
      throw new Error(`Cannot delete: Page with ID ${id} does not exist`);
    }
  }
}