import { logger } from "../logger.js";
import { exec } from 'child_process';

const _SECTION = "markets"

//==============================================================================================
// ROUTE
//==============================================================================================
import { Router, Request, Response } from 'express';

const router = Router();

router.all(/^\/api\/markets\/(.*)/, async (req, res) => {
    const content = req.params[0];

    if (content.toUpperCase() === 'SHUTDOWN') {
        logger.warn(
            _SECTION,
            `Blocked attempt to access protected route: ${req.method} /api/markets/SHUTDOWN`
        );

        res.status(403).json({
            error: 'Access denied.'
        });

        return;
    }

    const targetUrl = `http://localhost:5000/${content}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: ['GET', 'HEAD'].includes(req.method.toUpperCase())
                ? undefined
                : JSON.stringify(req.body),
        });

        res.status(response.status);

        // Copy toàn bộ header cần thiết từ Python Server sang
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('content-type', contentType);
        }
        
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            res.setHeader('content-length', contentLength);
        }

        // Kiểm tra xem route hiện tại có phải là API lấy file nhị phân (.bin) không
        const isBinaryRoute = req.path.endsWith('/bin');

        if (isBinaryRoute) {
            // Triệt tiêu ETag của Express sinh ra cho route binary (nguyên nhân gây weak ETag W/"...")
            res.removeHeader('ETag');
            
            // Đọc dữ liệu dưới dạng ArrayBuffer thô không qua bộ giải mã Text
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Gửi Buffer thô trực tiếp về Client
            res.send(buffer);
        } else {
            // Với các route thường (JSON), xử lý bằng text như cũ cho an toàn
            const text = await response.text();
            res.send(text);
        }

    } catch (error) {
        logger.error(
            _SECTION,
            `Proxy request failed: ${error instanceof Error ? error.message : String(error)}`
        );

        res.status(502).json({
            error: 'Unable to connect to market service server.'
         });
    }
});


//==============================================================================================
// EXPORT
//==============================================================================================
export const marketServer = {
    router
}