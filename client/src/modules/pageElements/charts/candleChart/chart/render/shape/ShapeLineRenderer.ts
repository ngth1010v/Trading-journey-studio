import { Container, Geometry, Mesh, Shader } from "pixi.js";
import ChartController from "../../ChartController";
import StateData from "../../../state/StateData";

export type RGBA = [number, number, number, number];

export interface Line {
  thickness  ?: number;
  color      ?: RGBA;
  timestamp1 ?: number;
  timestamp2 ?: number;
  price1     ?: number;
  price2     ?: number;
}

//======================================================================================================
// CONSTANT & HELPERS
//======================================================================================================
const VERTICES_PER_LINE = 6;
const LINE_VERTEX_CORNERS: Float32Array = new Float32Array([
  0, -1,
  1, -1,
  1,  1,
  0, -1,
  1,  1,
  0,  1
]);

function rgbaToVec4(rgba?: RGBA): [number, number, number, number] {
  if (!rgba) return [1, 1, 1, 1]; // Default to white if missing
  return [
    Math.max(0, Math.min(255, rgba[0])) / 255,
    Math.max(0, Math.min(255, rgba[1])) / 255,
    Math.max(0, Math.min(255, rgba[2])) / 255,
    Math.max(0, Math.min(1, rgba[3] ?? 1))
  ];
}

//======================================================================================================
// CLASS EXPORT
//======================================================================================================
export default class ShapeLineRenderer {
  // Replace `any` with `ChartController` if available in scope
  private state: StateData | any = null; 
  private chart: ChartController | any = null; 

  private container: Container;
  private mesh: Mesh | null = null;
  private geometry: Geometry | null = null;
  private shader: Shader;

  private rebuildGeometry = false;
  private capacity = 0;
  
  // Data buffers
  private corners = new Float32Array(0);
  private thicknesses = new Float32Array(0);
  private colors = new Float32Array(0);
  private lineStarts = new Float32Array(0);
  private lineEnds = new Float32Array(0);

  constructor() {
    this.container = new Container();
    this.shader = this.buildShader();
  }

  public init(state: StateData, chart: ChartController): void {
    this.chart = chart;
    this.state = state
  }

  public destroy(): void {
    if (this.mesh) {
      this.mesh.destroy();
      this.mesh = null;
    }
    if (this.geometry) {
      this.geometry.destroy();
      this.geometry = null;
    }
    this.container.destroy({ children: true });
    this.chart = null;
  }

  public addToContainer(parentContainer: any): void {
    if (this.container && parentContainer) {
      parentContainer.addChild(this.container);
    }
  }

  public updateData(lines: Line[]): void {
    if (!this.chart || !lines) return;

    const count = lines.length;
    if (count === 0) {
      if (this.mesh) this.mesh.visible = false;
      return;
    }

    // Attempting to resolve state via chart reference
    const view = this.state.config.get()?.viewport;
    const canvas = this.chart.event?.getCanvasSize();

    if (!view || !canvas || canvas.w <= 0 || canvas.h <= 0) return;

    // 1. Array Pooling / Expansion
    if (count > this.capacity) {
      this.capacity = count + 1000;
      this.corners = new Float32Array(this.capacity * 12);
      this.thicknesses = new Float32Array(this.capacity * 6);
      this.colors = new Float32Array(this.capacity * 24);
      this.lineStarts = new Float32Array(this.capacity * 12);
      this.lineEnds = new Float32Array(this.capacity * 12);
      this.rebuildGeometry = true;
    }

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) return;

    // 2. CPU Base Pixel Conversion
    for (let i = 0; i < count; i++) {
      const line = lines[i];

      const t1 = line.timestamp1 ?? 0;
      const p1 = line.price1 ?? 0;
      const t2 = line.timestamp2 ?? 0;
      const p2 = line.price2 ?? 0;

      // Base pixels calculation
      const startX = ((t1 - view.fromTs) / deltaTs) * canvas.w;
      const startY = canvas.h - ((p1 - view.fromPrice) / deltaPrice) * canvas.h;
      const endX = ((t2 - view.fromTs) / deltaTs) * canvas.w;
      const endY = canvas.h - ((p2 - view.fromPrice) / deltaPrice) * canvas.h;

      const thickness = line.thickness ?? 1.0;
      const color = rgbaToVec4(line.color);

      const vOffset = i * VERTICES_PER_LINE;
      const cOffset = i * 12; // 6 vertices * 2 floats
      const colOffset = i * 24; // 6 vertices * 4 floats

      for (let v = 0; v < VERTICES_PER_LINE; v++) {
        this.corners[cOffset + v * 2] = LINE_VERTEX_CORNERS[v * 2];
        this.corners[cOffset + v * 2 + 1] = LINE_VERTEX_CORNERS[v * 2 + 1];

        this.thicknesses[vOffset + v] = thickness;

        this.colors[colOffset + v * 4] = color[0];
        this.colors[colOffset + v * 4 + 1] = color[1];
        this.colors[colOffset + v * 4 + 2] = color[2];
        this.colors[colOffset + v * 4 + 3] = color[3];

        this.lineStarts[cOffset + v * 2] = startX;
        this.lineStarts[cOffset + v * 2 + 1] = startY;

        this.lineEnds[cOffset + v * 2] = endX;
        this.lineEnds[cOffset + v * 2 + 1] = endY;
      }
    }

    // 3. Update GPU Buffers
    if (this.rebuildGeometry || !this.geometry) {
      if (this.geometry) this.geometry.destroy();
      this.geometry = new Geometry();
      
      this.geometry.addAttribute("aCorner", { buffer: this.corners.subarray(0, count * 12), size: 2 });
      this.geometry.addAttribute("aThickness", { buffer: this.thicknesses.subarray(0, count * 6), size: 1 });
      this.geometry.addAttribute("aColor", { buffer: this.colors.subarray(0, count * 24), size: 4 });
      this.geometry.addAttribute("aLineStart", { buffer: this.lineStarts.subarray(0, count * 12), size: 2 });
      this.geometry.addAttribute("aLineEnd", { buffer: this.lineEnds.subarray(0, count * 12), size: 2 });

      if (this.mesh) {
        this.container.removeChild(this.mesh);
        this.mesh.destroy();
      }

      this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader } as any);
      this.container.addChild(this.mesh);
      this.rebuildGeometry = false;
    } else {
      const buffers = this.geometry.buffers;
      if (buffers) {
        buffers.forEach((b: any) => b.update?.());
      }
      if (this.mesh) this.mesh.visible = true;
    }

    this.render();
  }

  public updateTransform(): void {
    if (!this.chart) return;

    const view = this.state.config.get()?.viewport;
    const transform = this.state.viewport.getTransform();
    const canvas = this.chart.event?.getCanvasSize();

    if (!view || !canvas || canvas.w <= 0 || canvas.h <= 0) return;

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) return;

    const Mx = 1 / transform.scaleX;
    const Ax = ((view.fromTs * (1 - transform.scaleX) - transform.offsetX) / (deltaTs * transform.scaleX)) * canvas.w;

    const My = 1 / transform.scaleY;
    const Ay = canvas.h * (1 - My) - ((view.fromPrice * (1 - transform.scaleY) - transform.offsetY) / (deltaPrice * transform.scaleY)) * canvas.h;

    const shaderAny = this.shader as any;
    const uniforms = shaderAny.resources?.uLineUniforms?.uniforms;
    
    if (uniforms) {
      uniforms.uPixelWeights = [Mx, Ax, My, Ay];
    }

    this.render();
  }

  public render(): void {
    // Relying on PixiJS auto-render ticker cycle
    // Add specific canvas/chart request rendering invalidation hooks here if necessary
  }

  //======================================================================================================
  // PRIVATE SHADER SETUP
  //======================================================================================================
  private buildShader(): Shader {
    const uLineUniforms = {
      uProjectionMatrix: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: "mat3x3<f32>" },
      uPixelWeights: { value: new Float32Array([1, 0, 1, 0]), type: "vec4<f32>" }, // Mx, Ax, My, Ay
    };

    const vertexSrc = `
precision mediump float;

attribute vec2 aCorner;
attribute float aThickness;
attribute vec4 aColor;
attribute vec2 aLineStart;
attribute vec2 aLineEnd;

uniform mat3 uProjectionMatrix;
uniform vec4 uPixelWeights;

varying vec4 vColor;

void main(void) {
  vColor = aColor;

  float Mx = uPixelWeights.x;
  float Ax = uPixelWeights.y;
  float My = uPixelWeights.z;
  float Ay = uPixelWeights.w;

  vec2 p1 = vec2(aLineStart.x * Mx + Ax, aLineStart.y * My + Ay);
  vec2 p2 = vec2(aLineEnd.x * Mx + Ax, aLineEnd.y * My + Ay);

  vec2 dir = p2 - p1;
  vec2 norm = vec2(-dir.y, dir.x);
  if (length(norm) > 0.0) norm = normalize(norm);

  vec2 pointOnLine = mix(p1, p2, aCorner.x);
  vec2 screenPos = pointOnLine + norm * (aCorner.y * aThickness * 0.5);

  vec3 projected = uProjectionMatrix * vec3(screenPos, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
}
`;

    const fragmentSrc = `
precision mediump float;
varying vec4 vColor;

void main(void) {
  gl_FragColor = vec4(vColor.rgb * vColor.a, vColor.a);
}
`;

    return Shader.from({
      gl: {
        vertex: vertexSrc,
        fragment: fragmentSrc,
      },
      resources: {
        uLineUniforms,
      },
    });
  }
}