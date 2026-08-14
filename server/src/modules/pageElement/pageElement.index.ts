import { Router } from "express";
import { dataRouter } from "./pageElement.route.data.js";
import { configRouter } from "./pageElement.route.config.js";
import { pageElementRepository } from "./pageElement.repository.js";

const router = Router();

// Mount routes onto
router.use(dataRouter);
router.use(configRouter);

export const pageElement = {
  router,
  init: () => pageElementRepository.init(),
  shutdown: () => pageElementRepository.shutdown(),
};