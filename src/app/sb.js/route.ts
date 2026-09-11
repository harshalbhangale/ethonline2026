import { CLICK_TOKEN_PARAM } from "@/lib/assets/scan";
import { LANDING_EVENT } from "@/lib/assets/conversions";
import { resolveAppUrl } from "@/lib/assets/app-url";

export const runtime = "nodejs";

/**
 * The tag a brand adds to their own site:
 *
 *   <script src="https://<app>/sb.js" async></script>
 *
 * It reports the arrival, remembers the click for the rest of the session so a
 * signup on a later page is still attributable, and exposes
 * `stickerbomb("signup")` for the brand's own events.
 *
 * Served rather than pasted so the wiring can be corrected without every brand
 * editing their site.
 */
function script(appUrl: string) {
  const endpoint = `${appUrl.replace(/\/$/, "")}/api/track/conversion`;

  return `(function () {
  var PARAM = ${JSON.stringify(CLICK_TOKEN_PARAM)};
  var KEY = "stickerbomb.click";
  var ENDPOINT = ${JSON.stringify(endpoint)};

  function clickToken() {
    try {
      var fromUrl = new URLSearchParams(window.location.search).get(PARAM);
      if (fromUrl) {
        sessionStorage.setItem(KEY, fromUrl);
        return fromUrl;
      }
      return sessionStorage.getItem(KEY);
    } catch (error) {
      return null;
    }
  }

  function send(event, options) {
    var click = clickToken();
    if (!click) return;

    var body = { click: click, event: event };
    if (options && typeof options.value === "number") body.value = options.value;
    if (options && options.currency) body.currency = options.currency;

    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
        mode: "cors",
      }).catch(function () {});
    } catch (error) {
      /* Analytics must never break the brand's page. */
    }
  }

  window.stickerbomb = send;
  send(${JSON.stringify(LANDING_EVENT)});
})();
`;
}

export function GET(request: Request) {
  return new Response(script(resolveAppUrl(request)), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
