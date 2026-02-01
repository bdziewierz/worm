export const distanceTool = {
  name: 'calculate_distance',
  description: 'Calculate distance between two geographic coordinates (latitude/longitude)',
  category: 'utility',
  keywords: ['distance', 'coordinates', 'latitude', 'longitude', 'location', 'gps', 'geo'],
  parameters: {
    type: 'object',
    properties: {
      from_lat: {
        type: 'number',
        description: 'Starting latitude (-90 to 90)'
      },
      from_lon: {
        type: 'number',
        description: 'Starting longitude (-180 to 180)'
      },
      to_lat: {
        type: 'number',
        description: 'Destination latitude (-90 to 90)'
      },
      to_lon: {
        type: 'number',
        description: 'Destination longitude (-180 to 180)'
      }
    },
    required: ['from_lat', 'from_lon', 'to_lat', 'to_lon']
  },
  execute: async (args) => {
    try {
      const { from_lat, from_lon, to_lat, to_lon } = args;

      // Validate coordinates
      if (from_lat < -90 || from_lat > 90 || to_lat < -90 || to_lat > 90) {
        return { error: 'Latitude must be between -90 and 90' };
      }
      if (from_lon < -180 || from_lon > 180 || to_lon < -180 || to_lon > 180) {
        return { error: 'Longitude must be between -180 and 180' };
      }

      // Haversine formula for great-circle distance
      const toRad = (degrees) => degrees * (Math.PI / 180);
      
      const R = 6371; // Earth's radius in kilometers
      const dLat = toRad(to_lat - from_lat);
      const dLon = toRad(to_lon - from_lon);
      
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(from_lat)) * Math.cos(toRad(to_lat)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = R * c;
      const distanceMiles = distanceKm * 0.621371;

      // Calculate bearing
      const y = Math.sin(dLon) * Math.cos(toRad(to_lat));
      const x = Math.cos(toRad(from_lat)) * Math.sin(toRad(to_lat)) -
                Math.sin(toRad(from_lat)) * Math.cos(toRad(to_lat)) * Math.cos(dLon);
      const bearingRad = Math.atan2(y, x);
      const bearingDeg = ((bearingRad * 180 / Math.PI) + 360) % 360;

      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const directionIndex = Math.round(bearingDeg / 45) % 8;
      const direction = directions[directionIndex];

      return {
        from: { lat: from_lat, lon: from_lon },
        to: { lat: to_lat, lon: to_lon },
        distance_km: Math.round(distanceKm * 100) / 100,
        distance_miles: Math.round(distanceMiles * 100) / 100,
        bearing: Math.round(bearingDeg),
        direction: direction,
        summary: `${Math.round(distanceKm)} km (${Math.round(distanceMiles)} miles) to the ${direction}`
      };

    } catch (error) {
      return {
        error: `Distance calculation failed: ${error.message}`
      };
    }
  }
};
