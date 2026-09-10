/**
 * Money is stored and computed as integer minor units so amounts are exact.
 * This converts to a decimal string only at the serialization boundary.
 */
export function formatMinorUnits(value: bigint) {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const absolute = value < zero ? -value : value;
  const whole = absolute / hundred;
  const fraction = (absolute % hundred).toString().padStart(2, "0");

  return `${value < zero ? "-" : ""}${whole}.${fraction}`;
}
