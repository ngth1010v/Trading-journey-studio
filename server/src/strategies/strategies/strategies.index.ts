import { repository } from './strategies.repository.js';
import { router } from './strategies.route.js';
import { logger } from '../../logger.js';

const _SECTION = "strategies";

function init(): void {
  try {
    repository.initDb();
    logger.info(_SECTION, "Strategies module system started successfully.");
  } catch (error: any) {
    logger.error(_SECTION, `Failed to initialize strategies database: ${error.message}`);
  }
}

async function shutdown(): Promise<void> {
  try {
    logger.info(_SECTION, "Shutting down Strategies database module...");
    repository.closeDb();
  } catch (error: any) {
    logger.error(_SECTION, `Error during strategies database shutdown: ${error.message}`);
  }
}

export const strategies = {
  init,
  shutdown,
  router
};