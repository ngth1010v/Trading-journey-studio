import { logger } from "../logger.js";
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const _SECTION = "client";

let clientChild: ChildProcess | null = null;
let isExpectedShutdown = false; // Biến cờ để biết client tắt chủ động hay bị crash

function init(): void {
    if (clientChild) {
        logger.warn(_SECTION, "Client server is already running.");
        return;
    }

    const clientPath = path.resolve(process.cwd(), '..', 'client'); 
    isExpectedShutdown = false;

    // Sử dụng 'pipe' hoặc 'inherit' thay vì 'ignore' để không bị nghẽn/tự sập khi dev update code
    clientChild = spawn('npm', ['run', 'dev'], {
        cwd: clientPath,
        detached: true,
        shell: true,     
        stdio: ['ignore', 'pipe', 'pipe'] // Giữ lại stdout/stderr để bắt lỗi
    });

    // Lắng nghe dữ liệu log lỗi từ client (Rất quan trọng khi update code bị lỗi)
    clientChild.stderr?.on('data', (data) => {
        logger.error(_SECTION, `Client Log Error: ${data.toString().trim()}`);
    });

    clientChild.stdout?.on('data', (data) => {
        // Bạn có thể comment dòng này nếu thấy quá nhiều log dev thông thường
        logger.info(_SECTION, `Client Log: ${data.toString().trim()}`);
    });

    // Bắt sự kiện nếu tiến trình bỗng dưng bị sập khi đang update code
    clientChild.on('exit', (code, signal) => {
        clientChild = null;
        if (!isExpectedShutdown) {
            logger.error(_SECTION, `Client server crashed unexpectedly (Code: ${code}, Signal: ${signal}). Restarting in 3s...`);
            setTimeout(() => {
                init();
            }, 3000); // Tự động bật lại sau 3 giây nếu bị sập ngầm do lỗi code
        } else {
            logger.info(_SECTION, `Client server process exited safely.`);
        }
    });

    clientChild.unref();
    logger.info(_SECTION, `Open client-server successfully in detached mode.`);
}

async function shutdown(): Promise<void> {
    logger.info(_SECTION, `Shutting down Client-server...`);
    isExpectedShutdown = true; // Đánh dấu đây là hành động tắt chủ động, không kích hoạt tự động restart

    return new Promise<void>((resolve) => {
        if (clientChild && clientChild.pid) {
            try {
                // Thêm quyền ép buộc để dọn sạch toàn bộ tree process (NPM + Vite)
                const killCmd = `taskkill /PID ${clientChild.pid} /T /F`;
                const processKill = spawn('cmd.exe', ['/c', killCmd]);

                processKill.on('exit', () => {
                    logger.info(_SECTION, `Client-server shutdown command executed.`);
                    clientChild = null;
                    resolve();
                });
            } catch (error: any) {
                logger.error(_SECTION, `Error during killing client process: ${error.message}`);
                resolve();
            }
        } else {
            logger.warn(_SECTION, `No active client process found to shutdown.`);
            resolve();
        }
    });
}

export const clientServer = {
    init,
    shutdown
};