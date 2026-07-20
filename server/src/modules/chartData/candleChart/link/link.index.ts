import { linkRouter } from "./link.route.js";
import { linkRepository } from "./link.repository.js";

export const page = {
  router: linkRouter,
  
  init(): void {
    linkRepository.init();
  },
  
  shutdown(): void {
    linkRepository.shutdown();
  }
};