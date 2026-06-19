import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware cơ bản
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

// =============================================================================================================
// STARTUP
// Chỉ chứa logic kết nối / khởi tạo data của bạn
// =============================================================================================================
async function startup() {
  // TODO: Viết code khởi tạo data, kết nối database, đọc config... ở đây
  console.log('🔗 [startup] Đang khởi tạo kết nối database hoặc tải dữ liệu...');
  
  // Giả lập độ trễ kết nối (ví dụ: await myDatabase.connect())
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ [startup] Khởi tạo data thành công!');
}

// =============================================================================================================
// SHUTDOWN
// Chỉ chứa logic đóng kết nối / giải phóng data của bạn
// =============================================================================================================
async function shutdown() {
  // TODO: Viết code đóng kết nối database, giải phóng tài nguyên... ở đây
  console.log('🔌 [shutdown] Đang đóng kết nối database hoặc giải phóng data...');
  
  // Giả lập độ trễ ngắt kết nối (ví dụ: await myDatabase.disconnect())
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ [shutdown] Đã giải phóng data hoàn tất.');
}

// =============================================================================================================
// RUN - Quản lý vòng đời của Server và Data
// =============================================================================================================
async function startServer() {
  try {
    // 1. Chạy hàm khởi tạo data trước khi bật server
    await startup();

    // 2. Bật HTTP Server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });

    // 3. Lắng nghe tín hiệu tắt server từ hệ điều hành
    handleShutdown(server);

  } catch (error) {
    console.error('❌ Unable to start the server or data layer:', error);
    process.exit(1);
  }
}

function handleShutdown(server: import('http').Server) {
  const gracefulShutdown = (signal: string) => {
    console.log(`\n⚠️ Received ${signal}. Starting graceful shutdown...`);

    // Ngừng nhận request mới, xử lý các request đang dở dang
    server.close(async () => {
      console.log('⏹️ HTTP server closed.');

      try {
        // Gọi hàm shutdown xử lý phần data của bạn
        await shutdown();

        console.log('✅ Process terminated gracefully.');
        process.exit(0);
      } catch (err) {
        console.error('🔥 Error during graceful shutdown data:', err);
        process.exit(1);
      }
    });

    // Dự phòng: Nếu quá 10 giây mà vẫn chưa shutdown xong thì ép thoát
    setTimeout(() => {
      console.error('💀 Forcefully shutting down (timeout limit reached)...');
      process.exit(1);
    }, 10005);
  };

  // Lắng nghe các tín hiệu ngắt từ hệ điều hành hoặc Docker
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Bắt đầu chạy toàn bộ hệ thống
startServer();