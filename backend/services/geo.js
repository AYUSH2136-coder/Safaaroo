/**
 * geo.js — Geographic utility functions
 * 
 * Pure math module for GPS distance and speed calculations.
 * Uses the Haversine formula for great-circle distance on Earth's surface.
 */

const EARTH_RADIUS_M = 6_371_000; // Earth's mean radius in meters

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Calculate the great-circle distance between two GPS coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1 - Latitude of point A (degrees)
 * @param {number} lon1 - Longitude of point A (degrees)
 * @param {number} lat2 - Latitude of point B (degrees)
 * @param {number} lon2 - Longitude of point B (degrees)
 * @returns {number} Distance in meters
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
};

/**
 * Estimate speed in km/h from two consecutive GPS readings.
 * Falls back to 0 if time difference is too small to be meaningful.
 *
 * @param {number} prevLat  - Previous latitude (degrees)
 * @param {number} prevLon  - Previous longitude (degrees)
 * @param {number} prevTime - Previous timestamp (ms since epoch)
 * @param {number} curLat   - Current latitude (degrees)
 * @param {number} curLon   - Current longitude (degrees)
 * @param {number} curTime  - Current timestamp (ms since epoch)
 * @returns {number} Estimated speed in km/h
 */
const estimateSpeed = (prevLat, prevLon, prevTime, curLat, curLon, curTime) => {
  const timeDiffSeconds = (curTime - prevTime) / 1000;

  // Avoid division by zero or near-zero (less than 1 second gap)
  if (timeDiffSeconds < 1) return 0;

  const distanceMeters = haversineDistance(prevLat, prevLon, curLat, curLon);
  const speedMs = distanceMeters / timeDiffSeconds; // m/s
  const speedKmh = speedMs * 3.6; // Convert m/s → km/h

  return Math.round(speedKmh * 100) / 100; // Round to 2 decimal places
};

module.exports = {
  haversineDistance,
  estimateSpeed,
  EARTH_RADIUS_M
};
