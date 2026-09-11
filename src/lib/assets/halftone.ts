import QRCode from "qrcode";
import sharp from "sharp";

const DARK = 0;
const LIGHT = 255;

/**
 * Modules a decoder must read perfectly to find and orient the code at all.
 *
 * Finder patterns, their separators, the timing lines and the bottom-right
 * alignment pattern are rendered solid. Error correction can rescue damaged
 * data modules, but it cannot rescue a code the phone never locates.
 */
function isStructuralModule(row: number, column: number, size: number) {
  const inCorner = (top: number, left: number) =>
    row >= top && row < top + 8 && column >= left && column < left + 8;

  // The three finder patterns, each taken with its separator.
  if (inCorner(0, 0)) return true;
  if (inCorner(0, size - 8)) return true;
  if (inCorner(size - 8, 0)) return true;

  // Timing patterns.
  if (row === 6 || column === 6) return true;

  // The bottom-right alignment pattern, present from version 2 onwards.
  const centre = size - 7;
  if (
    size >= 25 &&
    row >= centre - 2 &&
    row <= centre + 2 &&
    column >= centre - 2 &&
    column <= centre + 2
  ) {
    return true;
  }

  return false;
}

function createMatrix(payload: string, version: number) {
  try {
    return QRCode.create(payload, { errorCorrectionLevel: "H", version });
  } catch {
    return QRCode.create(payload, { errorCorrectionLevel: "H" });
  }
}

/** Floyd–Steinberg, so continuous tone survives as texture rather than banding. */
function dither(target: Float32Array, size: number) {
  const output = Buffer.alloc(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const value = target[index];
      const quantised = value < 128 ? DARK : LIGHT;
      output[index] = quantised;

      const error = value - quantised;
      const lastColumn = x + 1 >= size;
      const lastRow = y + 1 >= size;

      if (!lastColumn) target[index + 1] += (error * 7) / 16;
      if (!lastRow) {
        if (x > 0) target[index + size - 1] += (error * 3) / 16;
        target[index + size] += (error * 5) / 16;
        if (!lastColumn) target[index + size + 1] += (error * 1) / 16;
      }
    }
  }

  return output;
}

/**
 * A QR code with the brand's artwork woven through it.
 *
 * Each module becomes a 3x3 block whose centre subpixel always carries the
 * module's true value, because that is the point a decoder samples. The eight
 * subpixels around it carry the dithered artwork, which is what makes the code
 * look like a picture instead of a barcode.
 *
 * `bias` trades likeness for legibility: 0 is pure artwork, 1 is a plain QR.
 * Callers raise it until the result decodes.
 */
export async function renderHalftoneQrPng({
  payload,
  artwork,
  bias,
  version = 10,
  blockSize = 5,
  width = 900,
  margin = 4,
}: {
  payload: string;
  artwork: Buffer;
  bias: number;
  /**
   * Forcing a higher version buys image fidelity: more modules means a finer
   * grid to draw into. It also makes each printed module smaller, so this
   * trades likeness against how far away a phone can still scan.
   */
  version?: number;
  blockSize?: number;
  width?: number;
  margin?: number;
}) {
  // A forced version is a request, not a requirement: a payload too long for
  // it must still produce a code rather than fail the whole poster.
  const qr = createMatrix(payload, version);
  const size = qr.modules.size;
  const modules = qr.modules.data;
  const inner = size * blockSize;

  // Cover-fit so the artwork fills the code without distorting its aspect.
  const greyscale = await sharp(artwork)
    .resize(inner, inner, { fit: "cover", position: "centre" })
    .greyscale()
    .normalise()
    .raw()
    .toBuffer();

  // Pull every subpixel part-way towards the value its module needs to be.
  const target = new Float32Array(inner * inner);
  for (let y = 0; y < inner; y += 1) {
    const row = Math.floor(y / blockSize);
    for (let x = 0; x < inner; x += 1) {
      const column = Math.floor(x / blockSize);
      const moduleLuminance =
        modules[row * size + column] === 1 ? DARK : LIGHT;
      const index = y * inner + x;
      target[index] =
        greyscale[index] * (1 - bias) + moduleLuminance * bias;
    }
  }

  const pixels = dither(target, inner);

  // Restore the parts a decoder cannot afford to have dithered.
  const centre = Math.floor(blockSize / 2);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const luminance = modules[row * size + column] === 1 ? DARK : LIGHT;
      const structural = isStructuralModule(row, column, size);

      for (let dy = 0; dy < blockSize; dy += 1) {
        for (let dx = 0; dx < blockSize; dx += 1) {
          if (!structural && (dx !== centre || dy !== centre)) continue;
          pixels[(row * blockSize + dy) * inner + column * blockSize + dx] =
            luminance;
        }
      }
    }
  }

  const quietZone = margin * blockSize;

  return sharp(pixels, { raw: { width: inner, height: inner, channels: 1 } })
    .extend({
      top: quietZone,
      bottom: quietZone,
      left: quietZone,
      right: quietZone,
      background: { r: LIGHT, g: LIGHT, b: LIGHT },
    })
    // Nearest neighbour: smoothing the subpixels would blur the module centres
    // a decoder depends on.
    .resize(width, width, { kernel: "nearest" })
    .png()
    .toBuffer();
}
