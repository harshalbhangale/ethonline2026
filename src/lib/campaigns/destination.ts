const domainLabelPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const topLevelDomainPattern =
  /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i;
const destinationPattern =
  /(?:^|[\s("'“:])((?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?)/gi;

function hasQualifiedHostname(hostname: string) {
  const normalized = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const labels = normalized.split(".");
  const topLevelDomain = labels.at(-1) ?? "";

  return (
    normalized.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => domainLabelPattern.test(label)) &&
    topLevelDomainPattern.test(topLevelDomain)
  );
}

export function normalizeCampaignDestination(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !hasQualifiedHostname(url.hostname)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function extractCampaignDestination(text: string) {
  for (const match of text.matchAll(destinationPattern)) {
    const candidate = match[1].replace(/[),.!?;:]+$/g, "");
    if (normalizeCampaignDestination(candidate)) return candidate;
  }

  return "";
}
