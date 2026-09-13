import { isLenientVerification, spotCheckPercent, geofenceRadiusMeters, minDwellSeconds, precheckRadiusMetres } from "@/lib/verification/leniency";
console.log("lenient mode :", isLenientVerification());
console.log("spot check % :", spotCheckPercent());
console.log("geofence     :", geofenceRadiusMeters(), "m");
console.log("min dwell    :", minDwellSeconds(), "s");
console.log("precheck     :", precheckRadiusMetres(), "m");
