import CandleChart from "./modules/analysis/charts/candleChart/CandleChart"




//===========================================================================================================
// TEST
//===========================================================================================================
import React, { useState } from "react";
import PanelInput from "./modules/input/panel/PanelInput";

// Simulated colors matching your type specifications
type RGB = [number, number, number];
type RGBA = [number, number, number, number];

function PanelInputTester() {
  // 1. Definition of the schema layout
  const layout = {
    panelColor: "rgba",
    text: {
      color: "rgb",
      size: "uNumber",
      alignX: "positionX",
      alignY: "positionY",
    },
    border: {
      color: "rgba",
      thickness: "uNumber",
    },
    pricing: {
      symbolPrice: "price", // Will format auto-label to "Symbol price"
      missingSetting: "number", // Intentionally absent in data to check missing state styling
    },
  };

  // 2. Initial state data reference mapping
  const [formData] = useState({
    panelColor: [255, 255, 100, 10] as RGBA,
    text: {
      color: [255, 255, 255] as RGB,
      size: 15,
      alignX: "center",
      alignY: "center",
    },
    border: {
      color: [255, 100, 100, 255] as RGBA,
      thickness: 2,
    },
    pricing: {
      symbolPrice: 1250.5,
      // missingSetting is omitted to verify Preference 2/b (opacity: 0.5 & not-allowed)
    },
  });

  // 3. Local state hook solely dedicated to reflecting mutations on the UI JSON viewer
  const [jsonOutput, setJsonOutput] = useState({ ...formData });

  const handleDataChange = (mutatedData: any) => {
    // Structural target modification verified: update visual state with shallow clone 
    // because internal key assignments were made deep in-place.
    setJsonOutput({ ...mutatedData });
  };

  return (
    <div style={{ padding: "24px", display: "flex", gap: "32px", fontFamily: "sans-serif" }}>
      {/* Dynamic input panel structure instantiation */}
      <div style={{ flex: 1 }}>
        <PanelInput
          layout={layout}
          data={formData}
          onDataChange={handleDataChange}
          width="400px"
          header={
            <div style={{ paddingBottom: "8px", borderBottom: "1px solid #444", fontWeight: "bold" }}>
              🎛️ Dynamic Layout Panel
            </div>
          }
          footer={
            <div style={{ paddingTop: "8px", borderTop: "1px solid #444", fontSize: "0.8rem", color: "#888" }}>
              Status: Connected to active form mutation pipeline
            </div>
          }
        />
      </div>

      {/* Real-time mutated state monitor frame */}
      <div style={{ flex: 1, backgroundColor: "#1e1e1e", color: "#a9dc76", padding: "16px", borderRadius: "8px" }}>
        <h3 style={{ margin: "0 0 12px 0", color: "#fff", borderBottom: "1px solid #333", paddingBottom: "8px" }}>
          Live Data Mutated State Output
        </h3>
        <pre style={{ fontSize: "0.85rem", margin: 0, overflowX: "auto", lineHeight: "1.4" }}>
          {JSON.stringify(jsonOutput, null, 2)}
        </pre>
      </div>
    </div>
  );
}



//===========================================================================================================
// APP
//===========================================================================================================
function App() {

  return (
    // <CandleChart/>
    <PanelInputTester/>
  )
}

export default App





