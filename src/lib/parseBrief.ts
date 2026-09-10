import { extractCampaignDestination } from "@/lib/campaigns/destination";
import { findPlaceInText } from "@/lib/campaigns/places";

export type Brief = {
  placements: string;
  city: string;
  countryCode: string;
  countryName: string;
  deadline: string;
  budget: string;
  /** Parsed opportunistically to pre-fill the creative step; not part of step 1. */
  destination: string;
};

const words: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  twelve: "12",
  fifteen: "15",
  twenty: "20",
};

export const emptyBrief: Brief = {
  placements: "",
  city: "",
  countryCode: "",
  countryName: "",
  deadline: "",
  budget: "",
  destination: "",
};

function findPlacements(text: string) {
  const digits = text.match(
    /(\d{1,3})\s*(?:artistic\s+|qr\s+)?(posters?|stickers?|placements?|prints?|nodes?)/i,
  );
  if (digits) return digits[1];

  const spelled = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\b\s*(?:artistic\s+|qr\s+)?(posters?|stickers?|placements?|prints?)/i,
  );
  if (spelled) return words[spelled[1].toLowerCase()];

  return "";
}

function findBudget(text: string) {
  const dollars = text.match(/\$\s?(\d[\d,]*)/);
  if (dollars) return dollars[1].replace(/,/g, "");

  const under = text.match(
    /(?:under|below|max|budget of|upto|up to)\s+(\d[\d,]*)/i,
  );
  if (under) return under[1].replace(/,/g, "");

  return "";
}

function findDeadline(text: string) {
  const relative = text.match(
    /\b(?:in|within)\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?|days?)\b/i,
  );
  if (relative) return `${relative[1]} ${relative[2].toLowerCase()}`;

  const clock = text.match(/\bby\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (clock) return `By ${clock[1].toLowerCase()}`;

  const day = text.match(
    /\b(today|tonight|tomorrow|this weekend|this evening)\b/i,
  );
  if (day) return day[1].charAt(0).toUpperCase() + day[1].slice(1).toLowerCase();

  return "";
}

export function parseBrief(text: string): Brief {
  if (!text.trim()) return emptyBrief;

  const place = findPlaceInText(text);

  return {
    placements: findPlacements(text),
    city: place?.city ?? "",
    countryCode: place?.countryCode ?? "",
    countryName: place?.countryName ?? "",
    deadline: findDeadline(text),
    budget: findBudget(text),
    destination: extractCampaignDestination(text),
  };
}
