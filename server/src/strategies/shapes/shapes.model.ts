export interface Shape {
  id      : string;
  type    : string;
  fromTs  : number; 
  toTs    : number;
  data    : string; // JSON, no need to validate
  styles  : string; // JSON, no need to validate
}