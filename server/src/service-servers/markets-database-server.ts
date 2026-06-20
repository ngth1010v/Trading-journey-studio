import { logger } from "../logger.js";
import { exec } from 'child_process';

const _SECTION = "markets"

function init(): void {
    const command = 'start "Market service server" python python/main.py';

    exec(command, (error, stdout, stderr) => {
        if (error) {
            logger.error(_SECTION, `Open market-server error: ${error.message}`);
            return;
        }
        if (stderr) {
            logger.error(_SECTION, `Open market-server error: ${stderr}`);
            return;
        }
    });

    logger.info(_SECTION, `Open market-server successfully.`);
}

// Chuyển thành async function để block tiến trình bằng await
async function shutdown(): Promise<void> {
    const url = 'http://localhost:5000/SHUTDOWN';

    logger.info(_SECTION, `Sending shutdown request to Markets-database-server: ${url}...`);
    
    try {
        const response = await fetch(url, { method: 'GET' });
        
        if (response.ok) {
            logger.info(_SECTION, `Markets-database-server shutdown successfully.`);
        } else {
            logger.error(_SECTION, `Server rejected the shutdown command. Status code: ${response.status}`);
        }
    } catch (error: any) {
        // Kiểm tra nếu lỗi do không kết nối được (server chưa mở)
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isNetworkError = error?.code === 'ECONNREFUSED' || errorMessage.includes('fetch failed') || errorMessage.includes('undici');

        if (isNetworkError) {
            logger.warn(
                _SECTION, 
                `Markets-database-server is not running or already closed (Connection refused).`
            );
        } else {
            // Các lỗi khác (lỗi logic, lỗi hệ thống khác) thì vẫn giữ là error
            logger.error(
                _SECTION, 
                `Connection error to server during shutdown request: ${errorMessage}`
            );
        }
    }
}

export const marketServer = {
    init,
    shutdown
}