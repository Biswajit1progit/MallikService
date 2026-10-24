// Calculates straight-line distance in km between two lat/lng points.
// Good enough for service-radius checks - not turn-by-turn road distance.
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Checks a point against all active service zones. Returns the zone it falls
// within (with distance_km attached) or null if it's outside every zone.
// Only handles zone_type = 'radius' for now - district_polygon support is a
// v2 addition, this function's signature won't need to change for that.
export function findMatchingZone(zones, lat, lng) {
  for (const zone of zones) {
    if (zone.zone_type !== "radius") continue;

    const distanceKm = haversineKm(
      parseFloat(zone.center_lat),
      parseFloat(zone.center_lng),
      lat,
      lng
    );

    if (distanceKm <= parseFloat(zone.radius_km)) {
      return { zone, distanceKm };
    }
  }
  return null;
}

// Looks up the flat booking fee for a given distance from the pricing_tiers table.
export async function getBookingCharge(pool, distanceKm) {
  const result = await pool.query(
    `SELECT flat_fee FROM pricing_tiers
     WHERE is_active = true AND $1 >= min_distance_km AND $1 <= max_distance_km
     ORDER BY min_distance_km ASC
     LIMIT 1`,
    [distanceKm]
  );
  return result.rows[0]?.flat_fee ?? null;
}