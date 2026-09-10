const NUMBER_PATTERN = "(\\d+)";

export function parseDeadlineInput(
  input: string,
  now = new Date(),
): Date | null {
  const value = input.trim().toLowerCase();

  if (!value) return null;

  const relative = value.match(
    new RegExp(`(?:in|within)\\s+${NUMBER_PATTERN}\\s*(minute|minutes|hour|hours|day|days)`),
  );

  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = unit.startsWith("minute")
      ? 60_000
      : unit.startsWith("hour")
        ? 3_600_000
        : 86_400_000;

    return new Date(now.getTime() + amount * multiplier);
  }

  const result = new Date(now);

  if (/\b(tonight|this evening|today)\b/.test(value)) {
    result.setHours(23, 59, 0, 0);
    return result > now ? result : null;
  }

  if (/\btomorrow\b/.test(value)) {
    result.setDate(result.getDate() + 1);
    result.setHours(18, 0, 0, 0);
    return result;
  }

  if (/\b(this weekend|weekend)\b/.test(value)) {
    const daysUntilSaturday = (6 - result.getDay() + 7) % 7 || 7;
    result.setDate(result.getDate() + daysUntilSaturday);
    result.setHours(18, 0, 0, 0);
    return result;
  }

  const clock = value.match(/(?:by\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);

  if (clock) {
    let hours = Number(clock[1]) % 12;
    const minutes = Number(clock[2] ?? 0);
    if (clock[3] === "pm") hours += 12;
    result.setHours(hours, minutes, 0, 0);
    if (result <= now) result.setDate(result.getDate() + 1);
    return result;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) || parsed <= now ? null : parsed;
}
