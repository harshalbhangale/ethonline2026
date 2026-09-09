export type Brief = {
  placements: string;
  area: string;
  deadline: string;
  budget: string;
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
  area: "",
  deadline: "",
  budget: "",
  destination: "",
};

function findPlacements(text: string) {
  const digits = text.match(
    /(\d{1,3})\s*(?:artistic\s+|qr\s+)?(posters?|stickers?|placements?|prints?|nodes?)/i
  );
  if (digits) return digits[1];

  const spelled = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\b\s*(?:artistic\s+|qr\s+)?(posters?|stickers?|placements?|prints?)/i
  );
  if (spelled) return words[spelled[1].toLowerCase()];

  return "";
}

function findBudget(text: string) {
  const dollars = text.match(/\$\s?(\d[\d,]*)/);
  if (dollars) return dollars[1].replace(/,/g, "");

  const under = text.match(/(?:under|below|max|budget of|upto|up to)\s+(\d[\d,]*)/i);
  if (under) return under[1].replace(/,/g, "");

  return "";
}

function findDeadline(text: string) {
  const relative = text.match(/\b(?:in|within)\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (relative) return `${relative[1]} ${relative[2].toLowerCase()}`;

  const clock = text.match(/\bby\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (clock) return `By ${clock[1].toLowerCase()}`;

  const day = text.match(/\b(today|tonight|tomorrow|this weekend|this evening)\b/i);
  if (day) return day[1].charAt(0).toUpperCase() + day[1].slice(1).toLowerCase();

  return "";
}

function findArea(text: string) {
  const near = text.match(
    /\b(?:near|around|outside|at|in)\s+((?:the\s+)?[A-Za-z][\w'’.-]*(?:\s+[A-Za-z][\w'’.-]*){0,4})/
  );
  if (!near) return "";

  const stop = /\b(by|before|under|within|and|with|for|to|send|today|tonight|tomorrow|budget|keep|so)\b/i;
  const cleaned = near[1]
    .split(/\s+/)
    .reduce<string[]>((acc, word) => {
      if (stop.test(word)) return acc;
      if (acc.length && stop.test(acc[acc.length - 1])) return acc;
      acc.push(word);
      return acc;
    }, [])
    .join(" ")
    .replace(/[.,]$/, "");

  return cleaned.trim();
}

function findDestination(text: string) {
  const url = text.match(/\b((?:https?:\/\/)?[\w-]+\.[a-z]{2,}(?:\/[\w\-./?%&=]*)?)/i);
  if (url) return url[1];

  const named = text.match(/\b(waitlist|signup page|sign-up page|landing page|mint page|demo page|menu)\b/i);
  if (named) return named[1].toLowerCase();

  return "";
}

export function parseBrief(text: string): Brief {
  if (!text.trim()) return emptyBrief;

  return {
    placements: findPlacements(text),
    area: findArea(text),
    deadline: findDeadline(text),
    budget: findBudget(text),
    destination: findDestination(text),
  };
}
