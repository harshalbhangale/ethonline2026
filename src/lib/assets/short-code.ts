import { randomBytes } from "node:crypto";

/**
 * Unambiguous alphabet: no 0/O/1/I/L, so a code read off a printed poster
 * cannot be mistyped into a different valid code.
 */
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Short codes must be unguessable, not sequential.
 *
 * A predictable code would let anyone enumerate campaigns and inflate another
 * brand's scan counts. Rejection sampling keeps the distribution uniform.
 */
export function generateShortCode(length = 10) {
  const max = 256 - (256 % alphabet.length);
  let code = "";

  while (code.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= max) continue;
      code += alphabet[byte % alphabet.length];
      if (code.length === length) break;
    }
  }

  return code;
}
