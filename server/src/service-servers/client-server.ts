import { logger } from "../logger.js";
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const _SECTION = "client";

// Lưu trữ reference tới ChildProcess độc lập
let clientChild: ChildProcess | null = null;

function init(): void {
    if (clientChild) {
        logger.warn(_SECTION, "Client server is already running.");
        return;
    }

    const clientPath = path.resolve(process.cwd(), '..', 'client'); 

    // Sử dụng spawn thay vì exec để có quyền 'detached' (tách lập tiến trình)
    // Chạy trực tiếp lệnh 'npm.cmd' (trên Windows phải gọi rõ .cmd) thay vì thông qua start
    clientChild = spawn('npm run dev', {
        cwd: clientPath,
        detached: true,
        shell: true,     // Bắt buộc phải có shell: true để Windows hiểu lệnh 'npm' viết liền này
        stdio: 'ignore'
    });

    // Unref giúp Node.js server có thể tự đóng độc lập mà không bị treo bởi tiến trình con này
    clientChild.unref();

    logger.info(_SECTION, `Open client-server successfully in detached mode.`);
}

async function shutdown(): Promise<void> {
    logger.info(_SECTION, `Shutting down Client-server...`);

    return new Promise<void>((resolve) => {
        if (clientChild && clientChild.pid) {
            try {
                // Trên Windows, để giết một tiến trình tách lập (detached) và các tiến trình con của nó (Vite)
                // mà KHÔNG ảnh hưởng tới tiến trình gọi (Node.js), ta dùng taskkill nhắm thẳng vào PID của npm run dev.
                // Do đã 'detached: true', cây tiến trình của clientChild đã bị cô lập hoàn toàn khỏi Node.js Server.
                const killCmd = `taskkill /PID ${clientChild.pid} /T /F`;
                
                const processKill = spawn('cmd.exe', ['/c', killCmd]);

                processKill.on('exit', () => {
                    logger.info(_SECTION, `Client-server shutdown successfully.`);
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