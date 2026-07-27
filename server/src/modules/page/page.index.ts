import { Router } from 'express';
import Database from 'better-sqlite3';
import { PageRepository } from './page.repository.js';
import { PageService } from './page.service.js';
import { createPageRouter } from './page.route.js';

let pageRouter: Router | null = null;
let pageService: PageService | null = null;

export const page = {
  get router(): Router {
    if (!pageRouter) {
      throw new Error('Page module must be initialized by calling .init(db) before accessing the router.');
    }
    return pageRouter;
  },

  init: (): void => {
    const repository = new PageRepository();
    repository.init(); // Prepares SQLite tables if missing

    pageService = new PageService(repository);
    pageRouter = createPageRouter(pageService);
  },

  isElementExist: (pageId: number, elementId: number): boolean | null => {
    if (!pageService) {
      return null;
    }
    return pageService.isElementExist(pageId, elementId);
  },

  shutdown: async (): Promise<void> => {
    // Perform any graceful module cleanup here if needed
    pageRouter = null;
    pageService = null;
  }
};