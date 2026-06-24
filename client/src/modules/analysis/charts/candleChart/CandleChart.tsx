import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import useCandleData, { type SetCandleDataArgs } from './hooks/useCandleData';
import useViewport, { type ViewportSetViewArgs } from './hooks/useViewport';
import useCandleLayer from './hooks/useCandleLayer';
import useViewController from './hooks/useViewController';
import useCursor, {type CursorStyles} from './hooks/useCursor';


const DEFAULT_FROMTS = 1782205200000
const DEFAULT_TOTS   = 1782208800000

const DEFAULT_DATA: SetCandleDataArgs = {
  symbol: "NAS100",
  timeframe: "1M",
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

const DEFAULT_CURSOR_STYLE: CursorStyles = {
  type      : "dash",
  thickness : 1,
  color     : [120, 120, 140],
  dashWidth : 15,
  dashSpace : 7,
}

export default function CandleChart() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const pixiAppRef    = useRef<Application | null>(null);
  const inited        = useRef(false)
  
  const candleData        = useCandleData();
  const viewport          = useViewport(candleData);
  const candleLayer       = useCandleLayer();
  const viewController    = useViewController(viewport);
  const cursorController  = useCursor(candleData, viewport)


  //=============================================================================================
  // Init / destroy
  //=============================================================================================
  const init = async () => {
    if (!containerRef.current) return;
    
    //==============================================================
    // Data
    //==============================================================
    await candleData.set(DEFAULT_DATA);
      

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
    // Cursor
    //==============================================================
    cursorController.init(app);
    cursorController.setStyle(DEFAULT_CURSOR_STYLE);
  
  }
  
  const destroy = async () => {
    if (pixiAppRef.current) {
      pixiAppRef.current.destroy(true, { children: true, texture: true });
      candleLayer.cleanup()
      cursorController.destroy()
    }
  }
  
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    init()
    return ()=>{destroy()}
  })
  
  
  
  //=============================================================================================
  // Event
  //=============================================================================================
  // React event
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    viewController.onMouseDown(x,y,e.button);
  }
  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    viewController.onMouseUp(x,y,e.button);
  }
  const onMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    viewController.onMouseLeave(x,y,e.button);
    cursorController.onMouseEnter()
  }
  const onMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    viewController.onMouseLeave(x,y,e.button);
    cursorController.onMouseLeave()
  }
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    viewController.onMouseMove(x,y);
    cursorController.onMouseMove(x,y);
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
      cursorController.onKeyDown(e.key)
    };
    element.addEventListener('keydown', handleKeyDown);
    
    // Key up
    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      viewController.onKeyUp(e.key);
      cursorController.onKeyUp(e.key)
    };
    element.addEventListener('keyup', handleKeyUp);



    // Dọn dẹp event listener
    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('keyup', handleKeyUp);
    };
  }, [viewController]); 

  //=============================================================================================
  // Return
  //=============================================================================================
  return (
    <div 
      ref={containerRef} 
      tabIndex={0}
      style={{ 
        width: '90vw', 
        height: '90vh', 
        margin: '5vh auto', 
        backgroundColor: '#141823', 
        overflow: 'hidden',
        position: 'relative',
        outline: 'none',
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
  );
}