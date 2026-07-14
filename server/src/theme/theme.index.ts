import { ThemeRepository } from './theme.repository.js';
import { ThemeService } from './theme.service.js';
import { createThemeRouter } from './theme.route.js';

const repository = new ThemeRepository();
const service = new ThemeService(repository);
const router = createThemeRouter(service);

export const theme = {
    router,
    
    init: () => {
        repository.init();
    },

    shutdown: () => {
        repository.shutdown();
    }
};