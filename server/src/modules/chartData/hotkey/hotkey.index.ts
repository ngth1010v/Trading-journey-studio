import { createHotkeyRouter } from "./hotkey.route.js";
import { HotkeyRepository } from "./hotkey.repository.js";
import { HotkeyService } from "./hotkey.service.js";

const repo = new HotkeyRepository();
const service = new HotkeyService(repo);
const router = createHotkeyRouter(service);

export const page = {
  router,
  init: () => {
    repo.init();
  },
  shutdown: () => {
    repo.shutdown();
  }
};