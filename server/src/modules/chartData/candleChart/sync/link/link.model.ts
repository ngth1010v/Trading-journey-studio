export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export interface Link {
  id?: number;
  name: string;
  color: {
    background: RGBA;
    border: RGBA;
    font: RGB;
  };
}

export type LinkState = any;