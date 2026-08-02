

export const CANDLE_SHADER = {
vertex :
`#version 300 es
precision highp float;

in vec2 aCorner;
in vec2 aCandleTimes;  // [openTimePx, closeTimePx]
in vec4 aCandlePrices; // [openY, highY, lowY, closeY]

uniform mat3 uProjectionMatrix;
uniform vec4 uTransform; // [scaleX, scaleY, offsetX, offsetY]
uniform float uPadding;

out vec2 vPixelPos;
out vec2 vTimes;        // [openTimePx, closeTimePx]
out vec4 vPrices;       // [openY, highY, lowY, closeY]

void main(void) {
  float scaleX = uTransform.x;
  float scaleY = uTransform.y;
  float offsetX = uTransform.z;
  float offsetY = uTransform.w;

  // Transform coordinates into screen pixel space
  float openTimePx  = floor(aCandleTimes.x * scaleX + offsetX) + 0.5;
  float closeTimePx = floor(aCandleTimes.y * scaleX + offsetX) + 0.5;

  float openY  = floor(aCandlePrices.x * scaleY + offsetY) + 0.5;
  float highY  = floor(aCandlePrices.y * scaleY + offsetY) + 0.5;
  float lowY   = floor(aCandlePrices.z * scaleY + offsetY) + 0.5;
  float closeY = floor(aCandlePrices.w * scaleY + offsetY) + 0.5;

  // Calculate quad bounds to cover wick and border lines completely
  float minX = min(openTimePx, openTimePx + uPadding - 1.0);
  float maxX = max(closeTimePx, closeTimePx - uPadding + 1.0);
  
  float minY = min(highY - 1.0, lowY - 1.0);
  float maxY = max(highY + 1.0, lowY + 1.0);

  vec2 pos = vec2(
    mix(minX, maxX, aCorner.x),
    mix(minY, maxY, aCorner.y)
  );

  vPixelPos = pos;
  vTimes = vec2(openTimePx, closeTimePx);
  vPrices = vec4(openY, highY, lowY, closeY);

  vec3 projected = uProjectionMatrix * vec3(pos, 1.0);
  gl_Position = vec4(projected.xy, 0.0, 1.0);
}
`,

fragment :
`#version 300 es
precision highp float;

uniform float uPadding;
uniform vec3 uUpOutlineColor;
uniform vec3 uUpBodyColor;
uniform vec3 uDownOutlineColor;
uniform vec3 uDownBodyColor;

in vec2 vPixelPos;
in vec2 vTimes;  // [openTimePx, closeTimePx]
in vec4 vPrices; // [openY, highY, lowY, closeY]

out vec4 fragColor;

void main(void) {
  float openTimePx  = vTimes.x;
  float closeTimePx = vTimes.y;

  float openY  = vPrices.x;
  float highY  = vPrices.y;
  float lowY   = vPrices.z;
  float closeY = vPrices.w;

  // Screen space: higher price = smaller Y
  bool isUp = closeY <= openY;

  vec3 outlineColor = isUp ? uUpOutlineColor : uDownOutlineColor;
  vec3 bodyColor    = isUp ? uUpBodyColor    : uDownBodyColor;

  bool hasWidth = (closeTimePx - openTimePx) > (uPadding * 2.0);

  // 1. Wick Line
  float wickX = (openTimePx + closeTimePx) * 0.5;
  bool inWick =
      abs(vPixelPos.x - wickX) <= 0.5 &&
      vPixelPos.y >= highY &&
      vPixelPos.y <= lowY;

  // 2. Body Rectangle
  float topY    = min(openY, closeY);
  float bottomY = max(openY, closeY);
  float leftX   = openTimePx + uPadding;
  float rightX  = closeTimePx - uPadding;

  bool inBody =
      hasWidth &&
      vPixelPos.x >= leftX &&
      vPixelPos.x <= rightX &&
      vPixelPos.y >= topY &&
      vPixelPos.y <= bottomY;

  // 3. Border Lines (around BODY only)
  float bLeftX  = openTimePx + uPadding - 0.5;
  float bRightX = closeTimePx - uPadding + 0.5;

  bool inHLine1 =
      hasWidth &&
      vPixelPos.x >= bLeftX &&
      vPixelPos.x <= bRightX &&
      abs(vPixelPos.y - (topY - 0.5)) <= 0.5;

  bool inHLine2 =
      hasWidth &&
      vPixelPos.x >= bLeftX &&
      vPixelPos.x <= bRightX &&
      abs(vPixelPos.y - (bottomY + 0.5)) <= 0.5;

  bool inVLine1 =
      hasWidth &&
      abs(vPixelPos.x - bLeftX) <= 0.5 &&
      vPixelPos.y >= (topY - 1.0) &&
      vPixelPos.y <= (bottomY + 1.0);

  bool inVLine2 =
      hasWidth &&
      abs(vPixelPos.x - bRightX) <= 0.5 &&
      vPixelPos.y >= (topY - 1.0) &&
      vPixelPos.y <= (bottomY + 1.0);

  bool inBorder = inHLine1 || inHLine2 || inVLine1 || inVLine2;

  vec4 color = vec4(0.0);

  if (inBody) {
    color = vec4(bodyColor, 1.0);
  }

  if (inWick || inBorder) {
    color = vec4(outlineColor, 1.0);
  }

  if (color.a <= 0.0) {
    discard;
  }

  fragColor = color;
}
`
}




