export type KnownPlace = {
  city: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  /** Extra spellings and neighbourhoods that should resolve to this city. */
  aliases?: string[];
};

/**
 * A small gazetteer used only to pre-fill the campaign brief.
 *
 * This is a convenience for extraction, not an inventory claim: having a city
 * here says nothing about whether approved locations exist there. Full search
 * is handled by the map's own geocoder, and the brand can correct any value.
 */
export const knownPlaces: KnownPlace[] = [
  {
    city: "New York",
    countryCode: "US",
    countryName: "United States",
    latitude: 40.7128,
    longitude: -74.006,
    aliases: ["nyc", "new york city", "manhattan", "brooklyn", "lower manhattan", "soho"],
  },
  {
    city: "San Francisco",
    countryCode: "US",
    countryName: "United States",
    latitude: 37.7749,
    longitude: -122.4194,
    aliases: ["sf", "bay area", "soma"],
  },
  {
    city: "Austin",
    countryCode: "US",
    countryName: "United States",
    latitude: 30.2672,
    longitude: -97.7431,
  },
  {
    city: "London",
    countryCode: "GB",
    countryName: "United Kingdom",
    latitude: 51.5072,
    longitude: -0.1276,
    aliases: ["shoreditch", "hackney"],
  },
  {
    city: "Berlin",
    countryCode: "DE",
    countryName: "Germany",
    latitude: 52.52,
    longitude: 13.405,
    aliases: ["kreuzberg", "mitte"],
  },
  {
    city: "Amsterdam",
    countryCode: "NL",
    countryName: "Netherlands",
    latitude: 52.3676,
    longitude: 4.9041,
  },
  {
    city: "Lisbon",
    countryCode: "PT",
    countryName: "Portugal",
    latitude: 38.7223,
    longitude: -9.1393,
    aliases: ["lisboa"],
  },
  {
    city: "Paris",
    countryCode: "FR",
    countryName: "France",
    latitude: 48.8566,
    longitude: 2.3522,
  },
  {
    city: "Bangalore",
    countryCode: "IN",
    countryName: "India",
    latitude: 12.9716,
    longitude: 77.5946,
    aliases: ["bengaluru", "koramangala", "indiranagar"],
  },
  {
    city: "Pune",
    countryCode: "IN",
    countryName: "India",
    latitude: 18.5204,
    longitude: 73.8567,
    aliases: ["koregaon park", "kalyani nagar", "viman nagar"],
  },
  {
    city: "Mumbai",
    countryCode: "IN",
    countryName: "India",
    latitude: 19.076,
    longitude: 72.8777,
    aliases: ["bandra", "andheri", "lower parel"],
  },
  {
    city: "Singapore",
    countryCode: "SG",
    countryName: "Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
  },
  {
    city: "Tokyo",
    countryCode: "JP",
    countryName: "Japan",
    latitude: 35.6762,
    longitude: 139.6503,
    aliases: ["shibuya", "shinjuku"],
  },
  {
    city: "Dubai",
    countryCode: "AE",
    countryName: "United Arab Emirates",
    latitude: 25.2048,
    longitude: 55.2708,
  },
  {
    city: "Toronto",
    countryCode: "CA",
    countryName: "Canada",
    latitude: 43.6532,
    longitude: -79.3832,
  },
  {
    city: "Buenos Aires",
    countryCode: "AR",
    countryName: "Argentina",
    latitude: -34.6037,
    longitude: -58.3816,
  },
  {
    city: "Cape Town",
    countryCode: "ZA",
    countryName: "South Africa",
    latitude: -33.9249,
    longitude: 18.4241,
    aliases: [
      "capetown",
      "city bowl",
      "woodstock",
      "green point",
      "sea point",
      "observatory",
      "gardens",
      "waterfront",
      "v&a waterfront",
      "salt river",
    ],
  },
];

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the earliest place mentioned in free text.
 *
 * Longer names are matched first so "New York" wins over a shorter substring,
 * and matches require word boundaries so "sf" does not fire inside "surfing".
 */
export function findPlaceInText(text: string): KnownPlace | null {
  if (!text.trim()) return null;

  const candidates: { place: KnownPlace; index: number; length: number }[] = [];

  for (const place of knownPlaces) {
    const names = [place.city, ...(place.aliases ?? [])].sort(
      (a, b) => b.length - a.length,
    );

    for (const name of names) {
      const pattern = new RegExp(`\\b${escapeForRegex(name)}\\b`, "i");
      const match = pattern.exec(text);

      if (match) {
        candidates.push({ place, index: match.index, length: name.length });
        break;
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.index - b.index || b.length - a.length);
  return candidates[0].place;
}

export function findPlaceByCity(city: string): KnownPlace | null {
  const needle = city.trim().toLowerCase();
  if (!needle) return null;

  return (
    knownPlaces.find(
      (place) =>
        place.city.toLowerCase() === needle ||
        (place.aliases ?? []).includes(needle),
    ) ?? null
  );
}
