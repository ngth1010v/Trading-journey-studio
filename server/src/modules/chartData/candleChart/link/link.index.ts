import { Router } from "express";
import { linkService } from "./link.service.js";
import { dataRouter } from "./link.route.data.js";
import { stateRouter } from "./link.route.state.js";

const REFRESH_DURATION = 1000;

const router = Router();
router.use(dataRouter);
router.use(stateRouter);

function init(): void {
  linkService.init();
}

function shutdown(): void {
  linkService.shutdown();
}

export const link = {
  init,
  shutdown,
  router,
  REFRESH_DURATION,
};