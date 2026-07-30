import ChartController from "./ChartController";

export default function ChartLayer({ chart }: { chart: ChartController }) {
  return (
    <div
      tabIndex={0} 
      style={{ outline: "none", width: "100%", height: "100%", position: "absolute", inset:"0" }} 
      onMouseDown={(e) => {
        e.currentTarget.focus(); 
        chart.event.onMouseDown(e);
      }}
      onMouseEnter={(e) => {
        e.currentTarget.focus(); 
        chart.event.onMouseEnter(e);
      }}
      onMouseMove={chart.event.onMouseMove}
      onMouseUp={chart.event.onMouseUp}
      onMouseLeave={chart.event.onMouseLeave}
      onKeyDown={chart.event.onKeyDown}
      onKeyUp={chart.event.onKeyUp}
      onWheel={chart.event.onWheel}
    />
  );
}