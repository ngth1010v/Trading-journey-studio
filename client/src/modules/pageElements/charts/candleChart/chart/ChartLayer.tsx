import { useEffect, useRef } from "react";
import ChartController from "./ChartController";

export default function ChartLayer({ chart }: { chart: ChartController }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chart.setCanvas(canvas);

    return () => {
      chart.destroy();
    };
  }, [chart]);

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      style={{
        outline: "none",
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: "0",
      }}
      onMouseDown={(e) => {
        // e.preventDefault()
        e.currentTarget.focus();
        chart.event.onMouseDown(e);
      }}
      onMouseEnter={(e) => {
        // e.preventDefault()
        e.currentTarget.focus();
        chart.event.onMouseEnter(e);
      }}
      onMouseMove={(e)=>{
        // e.preventDefault()
        chart.event.onMouseMove(e)
      }}
      onMouseUp={(e)=>{
        // e.preventDefault()
        chart.event.onMouseUp(e)
      }}
      onMouseLeave={(e)=>{
        // e.preventDefault()
        chart.event.onMouseLeave(e)
      }}
      onKeyDown={(e)=>{
        // e.preventDefault()
        chart.event.onKeyDown(e)
      }}
      onKeyUp={(e)=>{
        // e.preventDefault()
        chart.event.onKeyUp(e)
      }}
      onWheel={(e)=>{
        chart.event.onWheel(e)
      }}
    />
  );
}