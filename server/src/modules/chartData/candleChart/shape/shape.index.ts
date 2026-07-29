// shape/shape.index.ts
import { Router } from "express";
import { shapeDataRouter } from "./shape.route.data.js";
import { shapeTagRouter } from "./shape.route.tag.js";
import { shapeTemplateRouter } from "./shape.route.template.js";
import { strategyDbManager } from "./shape.service.js";

const router = Router();

// Route alignment mapping directly onto the required path constraints
router.use(shapeTagRouter);
router.use(shapeTemplateRouter);
router.use(shapeDataRouter);

export const shape = {
  router,
  init: () => {
    // Lazy system architecture: Connections open dynamically inside operations
  },
  shutdown: () => {
    strategyDbManager.shutdown();
  }
};