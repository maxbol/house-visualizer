// Solar position (NOAA general solar position equations, accuracy ~0.5°),
// plenty for visualising how light falls through the windows.
//
// Returns azimuth in degrees clockwise from true north, and elevation in
// degrees above the horizon, for a JS Date (interpreted at its real UTC
// instant) at the given latitude/longitude (degrees, east positive).
export function sunPosition(date, latDeg, lonDeg) {
  const rad = Math.PI / 180;
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - yearStart) / 86400000);
  const hoursUTC =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  const g = ((2 * Math.PI) / 365) * (dayOfYear + (hoursUTC - 12) / 24); // fractional year
  const eqTime = // minutes
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl = // radians
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const trueSolarMin = hoursUTC * 60 + eqTime + 4 * lonDeg; // minutes
  const hourAngle = (trueSolarMin / 4 - 180) * rad;

  const lat = latDeg * rad;
  const cosZen =
    Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const elevation = 90 - zen / rad;

  // atan2 form: 0 = south, positive towards west; shift to compass bearing
  const az =
    Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)
    ) / rad;
  const azimuth = (az + 180 + 360) % 360;

  return { azimuth, elevation };
}
