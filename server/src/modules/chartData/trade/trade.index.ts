import { Router } from "express";
import { TradeRepository } from "./trade.repository.js";
import { tradeDataRouter } from "./trade.route.data.js";
import { tradeTagRouter }  from "./trade.route.tag.js";
import { tradeStyleRouter } from "./trade.route.style.js";

const router = Router();

router.use("/trades/tags", tradeTagRouter);
router.use("/trades/style", tradeStyleRouter);
router.use("/trades", tradeDataRouter);

export const trade = {
  router,
  init() {
    TradeRepository.init();
  },
  shutdown() {
    TradeRepository.shutdown();
  }
};