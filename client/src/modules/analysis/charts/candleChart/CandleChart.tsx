import { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import useCandleData from './hooks/rawCandle/useCandleData';
import useViewport, { type ViewportSetViewArgs } from './hooks/viewport/useViewport';
import useCandleLayer from './hooks/rawCandle/useCandleLayer';
import useViewController from './hooks/viewport/useViewController';
import useCrosshair, {type CrosshairStyles} from './hooks/useCrosshair';
import useGridAxes from './hooks/axes/useGridAxes';
import useAxes from './hooks/axes/useAxes';
import useAxesController from './hooks/axes/useAxesController';
import useLineLayer from './hooks/shape/raw/useLineLayer';
import useTriangleLayer from './hooks/shape/raw/useTriangleLayer';

import Navigation from './components/navigation/Navigation';


const DEFAULT_FROMTS = 1782432000000
const DEFAULT_TOTS   = 1782439200000

const DEFAULT_DATA = {
  symbol: "NAS100",
  timeframe: "15M",
  realtime: true,
  fromTs: DEFAULT_FROMTS,
  toTs:   DEFAULT_TOTS
};

const DEFAULT_VIEW: ViewportSetViewArgs = {
  fromTs      : DEFAULT_FROMTS,
  toTs        : DEFAULT_TOTS,
  fromPrice   : 0,
  toPrice     : 1,
};

const DEFAULT_CURSOR_STYLE: CrosshairStyles = {
  type      : "dash",
  thickness : 1,
  color     : [100, 100, 100],
  dashWidth : 10,
  dashSpace : 5,
}

export default function CandleChart() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const pixiAppRef    = useRef<Application | null>(null);
  const inited        = useRef(false)

  const [browserCursor, setBrowserCursor] = useState<string>('crosshair');
  
  const candleData        = useCandleData();
  const viewport          = useViewport(candleData);
  const candleLayer       = useCandleLayer();
  const lineLayer         = useLineLayer(); 
  const triangleLayer     = useTriangleLayer();
  const viewController    = useViewController(viewport);
  const crosshair         = useCrosshair(candleData, viewport)
  const gridAxes          = useGridAxes(viewport, candleData)
  const axes              = useAxes(candleData, viewport, gridAxes);
  const axesController    = useAxesController(candleData,viewport,viewController, crosshair, gridAxes, axes)



  //=============================================================================================
  // Init / destroy
  //=============================================================================================
  const init = async () => {
    if (!containerRef.current) return;
    
    //==============================================================
    // Data
    //==============================================================
    await candleData.setSrc(DEFAULT_DATA.symbol, DEFAULT_DATA.timeframe);
    await candleData.setRange(DEFAULT_DATA.fromTs, DEFAULT_DATA.toTs);
    candleData.setRealtime(true)
    
      

    //==============================================================
    // Pixi-app
    //==============================================================
    let app: Application | null = null;
    app = new Application();
    pixiAppRef.current = app;
    
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
    if (app.canvas) {
      containerRef.current.appendChild(app.canvas);
    }
    

    //==============================================================
    // Viewport
    //==============================================================
    viewport.init();
    viewport.setCanvasSize({ width, height });
    viewport.setView(DEFAULT_VIEW);
    viewport.setAutoPrice();
    viewport.flush();

    //==============================================================
    // CandleLayer
    //==============================================================
    await candleLayer.init(app, candleData, viewport);
    candleLayer.updateData();
    await candleLayer.draw();
    
    //==============================================================
    // Raw shape
    //==============================================================
    lineLayer.init(app, viewport);
    triangleLayer.init(app, viewport);

    //==============================================================
    // Crosshair
    //==============================================================
    crosshair.init(app);
    crosshair.setStyle(DEFAULT_CURSOR_STYLE);
    
    //==============================================================
    // GridAxes
    //==============================================================
    gridAxes.init(app);

    //==============================================================
    // Axes
    //==============================================================
    axes.init(app);

    //==============================================================
    // Axes controller
    //==============================================================
    axesController.init(app, setBrowserCursor);
    axesController.draw()
    
    
    
    
    
    
    
    
    
    
    
    //==============================================================
    // TEST
    //==============================================================
    axes.setTimestampLabel({
      id: "open-time1",
      timestamp: DEFAULT_FROMTS,
      color: [255, 150, 150, 150],
      fontColor: [255, 255, 255],
    });
    axes.setTimestampLabel({
      id: "open-time2",
      timestamp: DEFAULT_TOTS,
      color: [255, 150, 150, 150],
      fontColor: [255, 255, 255],
    });
    axes.setPriceLabel({
      id: "current-price",
      price: 2944000,
      color: [255, 150, 150, 150],
      fontColor: [255, 255, 255],
    });   
    
    
    lineLayer.add({
      thickness: 2,
      color: [255, 255, 255, 255],
      timestamp1: DEFAULT_FROMTS,
      timestamp2: DEFAULT_TOTS,
      price1: 2944000,
      price2: 2944000
    });
    lineLayer.flush();
    lineLayer.draw();
    
    triangleLayer.add({
      color    : [255, 255, 255, 255],
      timestamp: [DEFAULT_FROMTS, (DEFAULT_FROMTS + DEFAULT_TOTS)/2, DEFAULT_TOTS],
      price    : [2943000, 2940000, 2943000]
    });
    triangleLayer.flush();
    triangleLayer.draw();
  }
  
  const destroy = async () => {
    if (pixiAppRef.current) {
      viewport.destroy()
      pixiAppRef.current.destroy(true, { children: true, texture: true });
      candleLayer.cleanup()
      crosshair.destroy()
      axesController.destroy()
      lineLayer.destroy() 
      triangleLayer.destroy()
    }
  }
  
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    init()
    return ()=>{destroy()}
  },[])
  
  
  
  //=============================================================================================
  // Event
  //=============================================================================================
  // React event
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    axesController.onMouseDown(x,y,e.button);
    viewController.onMouseDown(x,y,e.button);
  }
  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    axesController.onMouseUp();
    viewController.onMouseUp(x,y,e.button);
  }
  const onMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    crosshair.onMouseEnter()
  }
  const onMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    axesController.onMouseLeave();
    viewController.onMouseLeave(x,y,e.button);
    crosshair.onMouseLeave()
  }
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    axesController.onMouseMove(x,y);
    viewController.onMouseMove(x,y);
    crosshair.onMouseMove(x,y);
  }

  // Html event
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Wheel
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const delta = e.deltaY;
      
      viewController.onWheel(x, y, delta);
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    
    // Key down
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      viewController.onKeyDown(e.key);
      crosshair.onKeyDown(e.key)
    };
    element.addEventListener('keydown', handleKeyDown);
    
    // Key up
    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      viewController.onKeyUp(e.key);
      crosshair.onKeyUp(e.key)
    };
    element.addEventListener('keyup', handleKeyUp);

    // Resize
    const resizeObserver = new ResizeObserver((entries) => {
      if (!pixiAppRef.current) return;
      
      for (let entry of entries) {
        const { width, height } = entry.contentRect;

        // 1. Resize Pixi Application
        pixiAppRef.current.renderer.resize(width, height);

        // 2. Cập nhật lại kích thước Viewport
        viewport.setCanvasSize({ width, height });
        
        // 3. Render lại các layer (nếu viewport/candleLayer của bạn cần trigger vẽ lại)
        candleLayer.draw(); 
        lineLayer.draw(); 
        triangleLayer.draw();
        gridAxes.draw();
        axes.draw();
      }
    });
    resizeObserver.observe(element);



    // Dọn dẹp event listener
    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('keyup', handleKeyUp);
      resizeObserver.disconnect();
    };
  }, [viewController]); 








  //=============================================================================================
  // Return
  //=============================================================================================
  return (
    <div style={{
      width: '100vw', 
      height: '100vh', 
      backgroundColor: '#141823', 
      overflow: 'hidden',
      position: 'absolute',
      outline: 'none',   
      inset: 0   
    }}>
      <div 
        ref={containerRef} 
        tabIndex={0}
        style={{ 
          width: '100vw', 
          height: '100vh', 
          backgroundColor: '#141823', 
          overflow: 'hidden',
          position: 'absolute',
          outline: 'none',
          top: 0,
          left: 0,
          cursor: browserCursor as React.CSSProperties['cursor'],
        }}
        onMouseDown={onMouseDown} 
        onMouseEnter={(e) => {
          onMouseEnter(e)
          if (containerRef.current) containerRef.current.focus();
        }}
        onMouseUp={onMouseUp} 
        onMouseMove={onMouseMove} 
        onMouseLeave={(e) => {
          onMouseLeave(e)
          if (containerRef.current) containerRef.current.blur();
        }}
      />      
      <Navigation candleData={candleData}/>
    </div>

  );
}