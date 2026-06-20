import { Mutex } from 'async-mutex';

// Khởi tạo mutex để đảm bảo các dòng log không bị đan xen (race condition) khi gọi bất đồng bộ
const _LOCK = new Mutex();

const _RESET = "\x1b[0m";
const _COLORS: Record<string, string> = {
    "DEBUG": "\x1b[90m",   // Gray
    "INFO": "\x1b[32m",    // Green (Dùng mã 32 cho màu sáng rõ trên terminal)
    "WARNING": "\x1b[33m", // Yellow
    "ERROR": "\x1b[91m",   // Red
};

export function reset(): void {
    // Không cần thực hiện gì giống bản python
}

async function _write(level: string, section: string, message: string): Promise<void> {
    try {
        // Lấy thời gian hiện tại theo chuẩn UTC và format dạng YYYY-MM-DD HH:MM:SS
        const now = new Date();
        const ts = now.toISOString().replace('T', ' ').substring(0, 19);

        const levelUpper = level.toUpperCase();
        const color = _COLORS[levelUpper] || "";
        const line = `${ts} [${levelUpper}][${section}] ${message}`;

        // Khóa luồng tương tự threading.Lock trong Python để in log tuần tự
        const release = await _LOCK.acquire();
        try {
            console.log(`${color}${line}${_RESET}`);
        } finally {
            release();
        }
    } catch (error) {
        // Logging must never crash the application.
    }
}

export function debug(section: string, message: string): void {
    _write("DEBUG", section, message);
}

export function info(section: string, message: string): void {
    _write("INFO", section, message);
}

export function warn(section: string, message: string): void {
    _write("WARNING", section, message);
}

export function error(section: string, message: string): void {
    _write("ERROR", section, message);
}

export const logger = {
    debug,
    info,
    warn,
    error,
}