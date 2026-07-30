import { eventRepository } from "./event.repository.js";
import { eventRouter } from "./event.route.js";

function init(): void {
  eventRepository.init();
}

function shutdown(): void {
  eventRepository.shutdown();
}

export const event = {
  init,
  shutdown,
  router: eventRouter,
};

export default event;