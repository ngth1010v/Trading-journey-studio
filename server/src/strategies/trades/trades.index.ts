import { tradesRouter } from './trades.route.js';
import { TradesService } from './trades.service.js';

export const trade = {
  router: tradesRouter,
  service: TradesService // Exposing the service directly in case backend processes need native access
};