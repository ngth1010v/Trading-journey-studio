import { Router } from "express";
import { TradeRepository } from "./trade.repository.js";
import { tradeDataRouter } from "./trade.route.data.js";
import { tradeTagRouter }  from "./trade.route.tag.js";
import { tradeStyleRouter } from "./trade.route.style.js";

const router = Router();

router.use(tradeTagRouter);
router.use(tradeStyleRouter);
router.use(tradeDataRouter);

export const trade = {
  router,
  init() {
    TradeRepository.init();
  },
  shutdown() {
    TradeRepository.shutdown();
  }
};