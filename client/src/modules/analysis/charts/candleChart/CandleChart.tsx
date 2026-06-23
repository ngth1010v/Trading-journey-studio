import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import useCandleData, { type SetCandleDataArgs } from './hooks/useCandleData';
import useViewport, { type ViewportSetViewArgs } from './hooks/useViewport';
import useCandleLayer from './hooks/useCandleLayer';


const DEFAULT_FROMTS = 1781480000000
const DEFAULT_TOTS   = 1781484000000

const DEFAULT_DATA: SetCandleDataArgs = {
  symbol: "NAS100",
  timeframe: "1M",
  realtime: false,
  fromTs: DEFAULT_FROMTS,
  toTs:   DEFAULT_TOTS
};

const DEFAULT_VIEW: ViewportSetViewArgs = {
  fromTs      : DEFAULT_FROMTS,
  toTs        : DEFAULT_TOTS,
  fromPrice   : 0,
  toPrice     : 1,
};

export default function CandleChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pixiAppRef = useRef<Application | null>(null);
  const inited = useRef(false)
  
  // 👉 SỬA: Gọi Hook đúng chuẩn React tại top-level (Không bọc trong useRef)
  const candleData = useCandleData();
  const viewport = useViewport(candleData);
  const candleLayer = useCandleLayer();

  useEffect(() => {
    let app: Application | null = null;
    
    if (inited.current) return
    inited.current = true

    const initChart = async () => {
      if (!containerRef.current) return;
      
      // 1. Set data trước
      await candleData.set(DEFAULT_DATA);
      
      // 2. Khởi tạo PixiJS App trước để có Canvas thực tế trong DOM
      app = new Application();
      pixiAppRef.current = app;

      // Lấy kích thước thực tế dựa vào CSS 90vw/90vh của container đã mount
      const width = containerRef.current.getBoundingClientRect().width || window.innerWidth * 0.9;
      const height = containerRef.current.getBoundingClientRect().height || window.innerHeight * 0.9;

      await app.init({
        width,
        height,
        backgroundColor: 0x141823,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // 3. Chèn Canvas vào DOM giúp xác định kích thước chính xác tuyệt đối
      if (app.canvas) {
        containerRef.current.appendChild(app.canvas);
      }

      // 4. Cấu hình Viewport SAU KHI kích thước thật của Canvas đã sẵn sàng
      viewport.setCanvasSize({ width, height });
      viewport.setView(DEFAULT_VIEW);
      viewport.setAutoPrice();
      viewport.flush();

      // 5. Khởi tạo layer đồ họa
      await candleLayer.init(app, candleData, viewport);
      
      // 👉 Mẹo PixiJS v8: Ép Pixi render thử 1 frame để tạo `globalUniforms.uProjectionMatrix`
      app.render(); 
      
      // 6. Cập nhật dữ liệu và vẽ nến lên màn hình
      candleLayer.updateData();
      await candleLayer.draw();
    };

    initChart();

    // Dọn dẹp khi unmount
    return () => {
      if (app) {
        app.destroy(true, { children: true, texture: true });
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '90vw', 
        height: '90vh', 
        margin: '5vh auto', 
        backgroundColor: '#141823', 
        overflow: 'hidden',
        position: 'relative' // Giúp đảm bảo bouding rect hoạt động chuẩn
      }} 
    />
  );
}