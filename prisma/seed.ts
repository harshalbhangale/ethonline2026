import "dotenv/config";
import { Client } from "pg";
import { requireDirectDatabaseUrl } from "./database-url.ts";

type SeedLocation = {
  slug: string;
  venueName: string;
  /** Neighbourhood, used to make multi-area campaigns meaningful. */
  district: string;
  latitude: number;
  longitude: number;
  placementInstructions: string;
  maxActiveCampaigns: number;
};

type SeedCity = {
  city: string;
  countryCode: string;
  countryName: string;
  locations: SeedLocation[];
};

/**
 * Permissioned demo surfaces.
 *
 * These are the only locations StickerBomb may use. A brand chooses areas; the
 * system assigns exact points from this inventory. Venues are deliberately
 * spread across several neighbourhoods per city so multi-area campaigns have
 * something real to reach.
 */
const seedCities: SeedCity[] = [
  {
    city: "New York",
    countryCode: "US",
    countryName: "United States",
    locations: [
      {
        slug: "nyc-event-entrance-board",
        venueName: "Event entrance board",
        district: "Financial District",
        latitude: 40.7128,
        longitude: -74.006,
        placementInstructions:
          "Use the left-hand community panel beside the main entrance. Keep the poster below the venue signage and do not cover existing notices.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "nyc-sponsor-booth",
        venueName: "Sponsor booth",
        district: "Financial District",
        latitude: 40.7115,
        longitude: -74.0075,
        placementInstructions:
          "Attach to the rear fabric panel of the sponsor booth using the supplied clips. Adhesive is not permitted on booth surfaces.",
        maxActiveCampaigns: 1,
      },
      {
        slug: "nyc-coworking-noticeboard",
        venueName: "Coworking noticeboard",
        district: "Tribeca",
        latitude: 40.718,
        longitude: -74.002,
        placementInstructions:
          "Pin to the members' noticeboard by the lifts. Reception must be told before installation.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "nyc-cafe-window",
        venueName: "Café window",
        district: "Battery Park",
        latitude: 40.709,
        longitude: -74.011,
        placementInstructions:
          "Mount inside the window at eye height using static cling only. The QR must stay scannable from the pavement.",
        maxActiveCampaigns: 1,
      },
      {
        slug: "nyc-community-board",
        venueName: "Community board",
        district: "Tribeca",
        latitude: 40.7205,
        longitude: -74.0045,
        placementInstructions:
          "Use the upper-right quadrant of the public community board. Do not remove any existing notice.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "nyc-team-demo-table",
        venueName: "Team demo table",
        district: "Civic Center",
        latitude: 40.715,
        longitude: -73.9995,
        placementInstructions:
          "Place the standing card on the demo table beside the laptops. Keep it upright and clear of cables.",
        maxActiveCampaigns: 1,
      },
    ],
  },
  {
    city: "Pune",
    countryCode: "IN",
    countryName: "India",
    locations: [
      {
        slug: "pune-kp-cafe-board",
        venueName: "Koregaon Park café board",
        district: "Koregaon Park",
        latitude: 18.5362,
        longitude: 73.8939,
        placementInstructions:
          "Use the chalkboard frame beside the café entrance. Staff will position it during opening hours only.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "pune-kp-lane-noticeboard",
        venueName: "North Main Road noticeboard",
        district: "Koregaon Park",
        latitude: 18.5395,
        longitude: 73.8916,
        placementInstructions:
          "Pin to the shared retail noticeboard at the lane entrance. Keep clear of the shop's own signage.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "pune-kalyani-nagar-coworking",
        venueName: "Kalyani Nagar coworking board",
        district: "Kalyani Nagar",
        latitude: 18.5484,
        longitude: 73.901,
        placementInstructions:
          "Members' noticeboard opposite the lifts. Sign in at reception before installing.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "pune-viman-nagar-mall-panel",
        venueName: "Viman Nagar community panel",
        district: "Viman Nagar",
        latitude: 18.5679,
        longitude: 73.9143,
        placementInstructions:
          "Use the community events panel near the food court entrance. Mall staff must witness installation.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "pune-shivaji-nagar-college-board",
        venueName: "Shivaji Nagar campus board",
        district: "Shivaji Nagar",
        latitude: 18.5308,
        longitude: 73.8478,
        placementInstructions:
          "Outer public noticeboard beside the campus gate. Do not enter the campus itself.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "pune-baner-cafe-window",
        venueName: "Baner café window",
        district: "Baner",
        latitude: 18.559,
        longitude: 73.7868,
        placementInstructions:
          "Inside the front window at eye height, static cling only. The QR must scan from the footpath.",
        maxActiveCampaigns: 1,
      },
      {
        slug: "pune-hinjewadi-tech-park-board",
        venueName: "Hinjewadi tech park board",
        district: "Hinjewadi",
        latitude: 18.5912,
        longitude: 73.7389,
        placementInstructions:
          "Use the visitor noticeboard in the lobby. Facilities must approve on arrival.",
        maxActiveCampaigns: 3,
      },
    ],
  },
  {
    city: "Cape Town",
    countryCode: "ZA",
    countryName: "South Africa",
    locations: [
      {
        slug: "cpt-long-street-cafe-board",
        venueName: "Long Street café board",
        district: "City Bowl",
        latitude: -33.9249,
        longitude: 18.4187,
        placementInstructions:
          "Pavement A-board beside the entrance. Return it indoors at closing time.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "cpt-city-bowl-coworking",
        venueName: "City Bowl coworking noticeboard",
        district: "City Bowl",
        latitude: -33.9218,
        longitude: 18.4233,
        placementInstructions:
          "Members' board beside the kitchen. Reception must be notified before installing.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "cpt-woodstock-gallery-wall",
        venueName: "Woodstock gallery notice wall",
        district: "Woodstock",
        latitude: -33.928,
        longitude: 18.445,
        placementInstructions:
          "Use the permitted paste-up panel only. The surrounding brickwork is protected.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "cpt-salt-river-market-board",
        venueName: "Salt River market board",
        district: "Salt River",
        latitude: -33.9302,
        longitude: 18.4655,
        placementInstructions:
          "Traders' community board at the market entrance. Do not cover trader notices.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "cpt-observatory-student-board",
        venueName: "Observatory student board",
        district: "Observatory",
        latitude: -33.9385,
        longitude: 18.472,
        placementInstructions:
          "Public noticeboard outside the shopfront. Keep the lower third clear for municipal notices.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "cpt-green-point-park-panel",
        venueName: "Green Point community panel",
        district: "Green Point",
        latitude: -33.9075,
        longitude: 18.4074,
        placementInstructions:
          "Community events panel near the park gate. Municipal permit reference must be carried on site.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "cpt-sea-point-promenade-board",
        venueName: "Sea Point promenade board",
        district: "Sea Point",
        latitude: -33.9153,
        longitude: 18.3878,
        placementInstructions:
          "Use the promenade noticeboard frame. Wind exposure is high, so fix all four corners.",
        maxActiveCampaigns: 1,
      },
      {
        slug: "cpt-waterfront-visitor-board",
        venueName: "V&A Waterfront visitor board",
        district: "V&A Waterfront",
        latitude: -33.9036,
        longitude: 18.4204,
        placementInstructions:
          "Visitor information board beside the walkway. Centre management must witness installation.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "cpt-kloof-street-cafe-window",
        venueName: "Kloof Street café window",
        district: "Gardens",
        latitude: -33.931,
        longitude: 18.409,
        placementInstructions:
          "Inside the front window at eye height, static cling only. The QR must scan from the pavement.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "cpt-bree-street-coworking",
        venueName: "Bree Street coworking lobby",
        district: "City Bowl",
        latitude: -33.919,
        longitude: 18.418,
        placementInstructions:
          "Lobby community board opposite the lifts. Sign in at reception before installing.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "cpt-camps-bay-promenade-board",
        venueName: "Camps Bay promenade board",
        district: "Camps Bay",
        latitude: -33.951,
        longitude: 18.3776,
        placementInstructions:
          "Promenade noticeboard frame. High wind: fix all four corners with the supplied clips.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "cpt-claremont-mall-panel",
        venueName: "Claremont community panel",
        district: "Claremont",
        latitude: -33.9807,
        longitude: 18.4655,
        placementInstructions:
          "Community events panel near the main entrance. Centre management must witness installation.",
        maxActiveCampaigns: 3,
      },
    ],
  },
  {
    city: "New Delhi",
    countryCode: "IN",
    countryName: "India",
    locations: [
      {
        slug: "del-connaught-place-inner-circle",
        venueName: "Connaught Place inner circle board",
        district: "Connaught Place",
        latitude: 28.6315,
        longitude: 77.2167,
        placementInstructions:
          "Permitted community board in the inner circle colonnade. Keep clear of shop signage.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "del-khan-market-cafe-window",
        venueName: "Khan Market café window",
        district: "Khan Market",
        latitude: 28.6003,
        longitude: 77.227,
        placementInstructions:
          "Inside the café window at eye height, static cling only. Staff position it during opening hours.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "del-hauz-khas-gallery-wall",
        venueName: "Hauz Khas Village gallery wall",
        district: "Hauz Khas",
        latitude: 28.5535,
        longitude: 77.1943,
        placementInstructions:
          "Use the permitted paste-up panel beside the gallery entrance. The heritage wall itself is protected.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "del-saket-mall-panel",
        venueName: "Saket community panel",
        district: "Saket",
        latitude: 28.5285,
        longitude: 77.219,
        placementInstructions:
          "Community events panel near the food court entrance. Mall staff must witness installation.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "del-lajpat-nagar-market-board",
        venueName: "Lajpat Nagar market board",
        district: "Lajpat Nagar",
        latitude: 28.5677,
        longitude: 77.2433,
        placementInstructions:
          "Traders' association board at the Central Market entrance. Do not cover trader notices.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "del-nehru-place-coworking",
        venueName: "Nehru Place coworking board",
        district: "Nehru Place",
        latitude: 28.5494,
        longitude: 77.2519,
        placementInstructions:
          "Members' noticeboard by the lifts. Reception must be told before installation.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "del-rajouri-garden-cafe-board",
        venueName: "Rajouri Garden café board",
        district: "Rajouri Garden",
        latitude: 28.6415,
        longitude: 77.1209,
        placementInstructions:
          "Chalkboard frame beside the café entrance. Return it indoors at closing time.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "del-chandni-chowk-heritage-board",
        venueName: "Chandni Chowk visitor board",
        district: "Chandni Chowk",
        latitude: 28.6506,
        longitude: 77.2303,
        placementInstructions:
          "Visitor information board at the pedestrian plaza. Municipal permit reference must be carried on site.",
        maxActiveCampaigns: 2,
      },
    ],
  },
  {
    city: "Bengaluru",
    countryCode: "IN",
    countryName: "India",
    locations: [
      {
        slug: "blr-hsr-27th-main-cafe-window",
        venueName: "HSR 27th Main café window",
        district: "HSR Layout",
        latitude: 12.9116,
        longitude: 77.6446,
        placementInstructions:
          "Inside the café window at eye height, static cling only. The QR must scan from the footpath.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-hsr-sector-1-coworking",
        venueName: "HSR Sector 1 coworking board",
        district: "HSR Layout",
        latitude: 12.917,
        longitude: 77.644,
        placementInstructions:
          "Members' noticeboard by the lifts. Sign in at reception before installing.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-hsr-sector-2-market-board",
        venueName: "HSR Sector 2 market board",
        district: "HSR Layout",
        latitude: 12.9128,
        longitude: 77.6475,
        placementInstructions:
          "Shared retail noticeboard at the market lane entrance. Keep clear of shop signage.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-hsr-sector-4-bda-complex-board",
        venueName: "HSR BDA complex community board",
        district: "HSR Layout",
        latitude: 12.912,
        longitude: 77.638,
        placementInstructions:
          "Community board beside the complex entrance. Do not remove any existing notice.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-hsr-sector-6-park-panel",
        venueName: "HSR Sector 6 park gate panel",
        district: "HSR Layout",
        latitude: 12.908,
        longitude: 77.633,
        placementInstructions:
          "Residents' association panel at the park gate. Fix all four corners.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-hsr-sector-7-gym-board",
        venueName: "HSR Sector 7 gym noticeboard",
        district: "HSR Layout",
        latitude: 12.905,
        longitude: 77.642,
        placementInstructions:
          "Front-desk noticeboard inside the entrance. Staff must approve on arrival.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-koramangala-5th-block-cafe",
        venueName: "Koramangala 5th Block café board",
        district: "Koramangala",
        latitude: 12.9352,
        longitude: 77.6245,
        placementInstructions:
          "Chalkboard frame beside the entrance. Return it indoors at closing time.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-indiranagar-100ft-road-board",
        venueName: "Indiranagar 100 Feet Road board",
        district: "Indiranagar",
        latitude: 12.9719,
        longitude: 77.6412,
        placementInstructions:
          "Permitted community board outside the shopfront. Keep the lower third clear.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "blr-btm-layout-coworking",
        venueName: "BTM Layout coworking board",
        district: "BTM Layout",
        latitude: 12.9166,
        longitude: 77.6101,
        placementInstructions:
          "Members' board beside the kitchen. Reception must be notified before installing.",
        maxActiveCampaigns: 2,
      },
    ],
  },
  {
    city: "Mumbai",
    countryCode: "IN",
    countryName: "India",
    locations: [
      {
        slug: "bom-bandra-bandstand-board",
        venueName: "Bandra Bandstand promenade board",
        district: "Bandra West",
        latitude: 19.0443,
        longitude: 72.82,
        placementInstructions:
          "Promenade noticeboard frame. Sea wind: fix all four corners with the supplied clips.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "bom-linking-road-cafe-window",
        venueName: "Linking Road café window",
        district: "Bandra West",
        latitude: 19.0642,
        longitude: 72.833,
        placementInstructions:
          "Inside the café window at eye height, static cling only. The QR must scan from the pavement.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "bom-lower-parel-coworking",
        venueName: "Lower Parel coworking lobby",
        district: "Lower Parel",
        latitude: 18.9953,
        longitude: 72.8295,
        placementInstructions:
          "Lobby community board opposite the lifts. Sign in at reception before installing.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "bom-colaba-causeway-board",
        venueName: "Colaba Causeway traders' board",
        district: "Colaba",
        latitude: 18.915,
        longitude: 72.8258,
        placementInstructions:
          "Traders' association board at the causeway entrance. Do not cover trader notices.",
        maxActiveCampaigns: 2,
      },
      {
        slug: "bom-powai-hiranandani-panel",
        venueName: "Powai Hiranandani community panel",
        district: "Powai",
        latitude: 19.1176,
        longitude: 72.906,
        placementInstructions:
          "Community events panel near the high-street entrance. Estate management must witness installation.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "bom-andheri-west-cafe-board",
        venueName: "Andheri West café board",
        district: "Andheri West",
        latitude: 19.1364,
        longitude: 72.8296,
        placementInstructions:
          "Chalkboard frame beside the café entrance. Staff position it during opening hours only.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "bom-bkc-coworking-board",
        venueName: "BKC coworking noticeboard",
        district: "Bandra Kurla Complex",
        latitude: 19.066,
        longitude: 72.868,
        placementInstructions:
          "Members' noticeboard by the lifts. Reception must be told before installation.",
        maxActiveCampaigns: 3,
      },
      {
        slug: "bom-kala-ghoda-gallery-wall",
        venueName: "Kala Ghoda gallery notice wall",
        district: "Kala Ghoda",
        latitude: 18.9285,
        longitude: 72.8321,
        placementInstructions:
          "Use the permitted paste-up panel only. The surrounding heritage facade is protected.",
        maxActiveCampaigns: 2,
      },
    ],
  },
  {
    city: "Jalgaon",
    countryCode: "IN",
    countryName: "India",
    locations: [
      {
        slug: "jal-mj-college-noticeboard",
        venueName: "MJ College campus noticeboard",
        district: "MJ College",
        latitude: 21.0077,
        longitude: 75.5626,
        placementInstructions:
          "Outer public noticeboard beside the college gate. Do not enter the campus itself.",
        maxActiveCampaigns: 2,
      },
    ],
  },
];

async function main() {
  const client = new Client({ connectionString: requireDirectDatabaseUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const city of seedCities) {
      for (const location of city.locations) {
        await client.query(
          `INSERT INTO locations (
             id, slug, venue_name, country_code, country_name, city,
             latitude, longitude, placement_instructions,
             permission_status, max_active_campaigns, updated_at
           ) VALUES (
             gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, 'APPROVED', $9, NOW()
           )
           ON CONFLICT (slug) DO UPDATE SET
             venue_name = EXCLUDED.venue_name,
             country_code = EXCLUDED.country_code,
             country_name = EXCLUDED.country_name,
             city = EXCLUDED.city,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             placement_instructions = EXCLUDED.placement_instructions,
             permission_status = 'APPROVED',
             max_active_campaigns = EXCLUDED.max_active_campaigns,
             updated_at = NOW()`,
          [
            location.slug,
            location.venueName,
            city.countryCode,
            city.countryName,
            city.city,
            location.latitude,
            location.longitude,
            location.placementInstructions,
            location.maxActiveCampaigns,
          ],
        );
      }
    }

    await client.query("COMMIT");

    const summary = await client.query<{
      city: string;
      country_name: string;
      approved: string;
    }>(
      `SELECT city, country_name, COUNT(*)::text AS approved
         FROM locations
        WHERE permission_status = 'APPROVED'
        GROUP BY city, country_name
        ORDER BY city`,
    );

    for (const row of summary.rows) {
      console.log(
        `Approved locations in ${row.city}, ${row.country_name}: ${row.approved}`,
      );
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
