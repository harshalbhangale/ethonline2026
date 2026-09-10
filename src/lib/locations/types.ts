export type AvailableLocationDto = {
  id: string;
  venueName: string;
  city: string;
  countryCode: string;
  countryName: string;
  latitude: number;
  longitude: number;
  distanceMetres: number;
  placementInstructions: string;
  maxActiveCampaigns: number;
  activeCampaigns: number;
  /** False when the venue is already at its active-campaign limit. */
  hasCapacity: boolean;
  /** True when this campaign has already selected the location. */
  selected: boolean;
  /** Which campaign area this venue was matched to, when areas were supplied. */
  areaLabel?: string;
  areaIndex?: number;
};

export type AreaAvailability = {
  label: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
  availableCount: number;
};

export type AvailableLocationsResponse = {
  centre: { latitude: number; longitude: number } | null;
  radiusMetres: number;
  areas: AreaAvailability[];
  /** Distinct locations across all areas that still have capacity. */
  availableCount: number;
  locations: AvailableLocationDto[];
};
