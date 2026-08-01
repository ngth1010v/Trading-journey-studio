import { Container, Geometry, Mesh, Shader } from "pixi.js";
import ChartController from "../../ChartController";
import StateData from "../../../state/StateData";

export type RGBA = [number, number, number, number];

export type Triangle = {
  color     : RGBA;                       // rgba 
  timestamp : [number, number, number];   // point1, point2, point3
  price     : [number, number, number];   // point1, point2, point3
};

//======================================================================================================
// CONSTANT & HELPERS
//======================================================================================================
const VERTICES_PER_TRIANGLE = 3;

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
export default class ShapeTriangleRenderer {
  private state: StateData | any = null; 
  private chart: ChartController | any = null; 

  private container: Container;
  private mesh: Mesh | null = null;
  private geometry: Geometry | null = null;
  private shader: Shader;

  private rebuildGeometry = false;
  private capacity = 0;
  
  // Data buffers (Separate attribute arrays matching ShapeLineRenderer pattern)
  private positions = new Float32Array(0); // 3 vertices * 2 floats (x, y) = 6 floats per triangle
  private colors = new Float32Array(0);    // 3 vertices * 4 floats (r, g, b, a) = 12 floats per triangle

  constructor() {
    this.container = new Container();
    this.shader = this.buildShader();
  }

  public init(state: StateData, chart: ChartController): void {
    this.chart = chart;
    this.state = state;
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
    this.state = null;
  }

  public addToContainer(parentContainer: any): void {
    if (this.container && parentContainer) {
      parentContainer.addChild(this.container);
    }
  }

  public updateData(triangles: Triangle[]): void {
    if (!this.chart || !this.state || !triangles) return;

    const count = triangles.length;
    if (count === 0) {
      if (this.mesh) this.mesh.visible = false;
      return;
    }

    const view = this.state.config?.get?.()?.viewport ?? this.state.config?.viewport;
    const canvas = this.chart.event?.getCanvasSize();

    if (!view || !canvas || canvas.w <= 0 || canvas.h <= 0) return;

    // 1. Array Pooling / Expansion
    if (count > this.capacity) {
      this.capacity = count + 1000;
      this.positions = new Float32Array(this.capacity * 6);
      this.colors = new Float32Array(this.capacity * 12);
      this.rebuildGeometry = true;
    }

    const deltaTs = view.toTs - view.fromTs;
    const deltaPrice = view.toPrice - view.fromPrice;

    if (deltaTs === 0 || deltaPrice === 0) return;

    // 2. CPU Base Pixel Conversion
    for (let i = 0; i < count; i++) {
      const tri = triangles[i];
      const color = rgbaToVec4(tri.color);

      const posOffset = i * 6;  // 3 vertices * 2 floats
      const colOffset = i * 12; // 3 vertices * 4 floats

      for (let v = 0; v < VERTICES_PER_TRIANGLE; v++) {
        const ts = tri.timestamp?.[v] ?? 0;
        const pr = tri.price?.[v] ?? 0;

        // Base pixel calculations
        const px = ((ts - view.fromTs) / deltaTs) * canvas.w;
        const py = canvas.h - ((pr - view.fromPrice) / deltaPrice) * canvas.h;

        this.positions[posOffset + v * 2] = px;
        this.positions[posOffset + v * 2 + 1] = py;

        this.colors[colOffset + v * 4] = color[0];
        this.colors[colOffset + v * 4 + 1] = color[1];
        this.colors[colOffset + v * 4 + 2] = color[2];
        this.colors[colOffset + v * 4 + 3] = color[3];
      }
    }

    // 3. Update GPU Buffers
    if (this.rebuildGeometry || !this.geometry) {
      if (this.geometry) this.geometry.destroy();
      this.geometry = new Geometry();
      
      this.geometry.addAttribute("aPosition", { 
        buffer: this.positions.subarray(0, count * 6), 
        size: 2 
      });
      this.geometry.addAttribute("aColor", { 
        buffer: this.colors.subarray(0, count * 12), 
        size: 4 
      });

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
    if (!this.chart || !this.state) return;

    const view = this.state.config?.get?.()?.viewport ?? this.state.config?.viewport;
    const transform = this.state.viewport?.getTransform?.() ?? { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
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
    const uniforms = shaderAny.resources?.uTriangleUniforms?.uniforms;
    
    if (uniforms) {
      uniforms.uPixelWeights = [Mx, Ax, My, Ay];
    }

    this.render();
  }

  public render(): void {
    // Relying on PixiJS auto-render ticker cycle
  }

  //======================================================================================================
  // PRIVATE SHADER SETUP
  //======================================================================================================
  private buildShader(): Shader {
    const uTriangleUniforms = {
      uProjectionMatrix: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), type: "mat3x3<f32>" },
      uPixelWeights: { value: new Float32Array([1, 0, 1, 0]), type: "vec4<f32>" }, // Mx, Ax, My, Ay
    };

    const vertexSrc = `
precision mediump float;

attribute vec2 aPosition;
attribute vec4 aColor;

uniform mat3 uProjectionMatrix;
uniform vec4 uPixelWeights;

varying vec4 vColor;

void main(void) {
  vColor = aColor;

  float Mx = uPixelWeights.x;
  float Ax = uPixelWeights.y;
  float My = uPixelWeights.z;
  float Ay = uPixelWeights.w;

  vec2 screenPos = vec2(aPosition.x * Mx + Ax, aPosition.y * My + Ay);

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
        uTriangleUniforms,
      },
    });
  }
}