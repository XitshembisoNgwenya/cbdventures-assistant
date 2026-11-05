const EARTH_RADIUS_METERS = 6371008.8;
function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function distanceMeters(a, b) {
  if (!validCoordinates(a.lat, a.lng) || !validCoordinates(b.lat, b.lng)) return Infinity;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lng - a.lng) * toRad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function bearingDegrees(from, to) {
  const toRad = Math.PI / 180;
  const a = from.lat * toRad, b = to.lat * toRad, d = (to.lng - from.lng) * toRad;
  return (Math.atan2(Math.sin(d) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d)) * 180 / Math.PI + 360) % 360;
}
module.exports = { validCoordinates, distanceMeters, bearingDegrees };
