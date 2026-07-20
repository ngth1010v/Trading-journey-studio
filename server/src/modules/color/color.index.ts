import { ColorRepository } from "./color.repository.js";
import { ColorService } from "./color.service.js";
import { createColorRouter } from "./color.route.js";

const repository = new ColorRepository();
const service = new ColorService(repository);
const router = createColorRouter(service);

export const color = {
  router,
  init: () => {
    repository.init();
  },
  shutdown: () => {
    repository.shutdown();
  }
};