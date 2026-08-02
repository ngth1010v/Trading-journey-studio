import { useEffect, useRef } from "react";
import ChartController from "./ChartController";

export default function ChartLayer({
  chart,
}: {
  chart: ChartController;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    chart.setCanvas(canvas);

    const handleWheel = (e: WheelEvent) => {
      // Ngăn browser scroll / Ctrl + Wheel zoom
      e.preventDefault();

      // Forward native event
      chart.event.onWheel(e);
    };

    canvas.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
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
        inset: 0,
        touchAction: "none",
      }}
      onMouseDown={(e) => {
        e.currentTarget.focus();
        chart.event.onMouseDown(e);
      }}
      onMouseEnter={(e) => {
        e.currentTarget.focus();
        chart.event.onMouseEnter(e);
      }}
      onMouseMove={(e) => {
        chart.event.onMouseMove(e);
      }}
      onMouseUp={(e) => {
        chart.event.onMouseUp(e);
      }}
      onMouseLeave={(e) => {
        chart.event.onMouseLeave(e);
      }}
      onKeyDown={(e) => {
        chart.event.onKeyDown(e);
      }}
      onKeyUp={(e) => {
        chart.event.onKeyUp(e);
      }}
    />
  );
}