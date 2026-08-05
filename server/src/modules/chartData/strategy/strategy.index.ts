import { Router } from "express";
import { repo } from "./strategy.repository.js";
import strategyRouter from "./strategy.route.data.js";
import tagRouter from "./strategy.route.tag.js";
import seasonRouter from "./strategy.route.season.js";

const router = Router();

// Mount endpoints relative to target rules
router.use(tagRouter);
router.use(seasonRouter);
router.use(strategyRouter);

export const strategy = {
  router,
  init: () => {
    repo.init();
  },
  shutdown: () => {
    repo.close();
  }
};