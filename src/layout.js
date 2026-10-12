// Coordinates belong to the unchanged 864 × 1536 background artwork.
// Stage centers are on the top surfaces of three consecutive path pedestals.
export const MAP_PADS = [
  { id: 1, x: 646, y: 910, width: 108, height: 80 },
  { id: 2, x: 460, y: 804, width: 108, height: 80 },
  { id: 3, x: 289, y: 731, width: 108, height: 80 },
];
export const TITLE_CHARACTERS = { x: 170, y: 890, width: 530, height: 222 };
export function coverGeometry(
  width,
  height,
  imageWidth = 864,
  imageHeight = 1536,
) {
  const scale = Math.max(width / imageWidth, height / imageHeight);
  return {
    scale,
    width: imageWidth * scale,
    height: imageHeight * scale,
    x: (width - imageWidth * scale) / 2,
    y: (height - imageHeight * scale) / 2,
  };
}
export function projectPoint(point, geometry) {
  return {
    x: geometry.x + point.x * geometry.scale,
    y: geometry.y + point.y * geometry.scale,
  };
}
