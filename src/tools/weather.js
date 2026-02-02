export const weatherTool = {
  name: 'get_weather',
  description: 'Get current weather information for a location',
  category: 'weather',
  keywords: ['weather', 'temperature', 'forecast', 'climate', 'hot', 'cold', 'rain'],
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city or location to get weather for (e.g., "London", "New York")',
      },
    },
    required: ['location'],
  },
  execute: async args => {
    try {
      const { location } = args;

      // Step 1: Geocode the location using Open-Meteo Geocoding API (no key needed)
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
      const geoResponse = await fetch(geoUrl);

      if (!geoResponse.ok) {
        return { error: 'Failed to find location' };
      }

      const geoData = await geoResponse.json();

      if (!geoData.results || geoData.results.length === 0) {
        return { error: `Location "${location}" not found` };
      }

      const place = geoData.results[0];
      const { latitude, longitude, name, country } = place;

      // Step 2: Get weather data using Open-Meteo Weather API (no key needed)
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
      const weatherResponse = await fetch(weatherUrl);

      if (!weatherResponse.ok) {
        return { error: 'Failed to fetch weather data' };
      }

      const weatherData = await weatherResponse.json();
      const current = weatherData.current;

      // Weather code to description mapping (WMO codes)
      const weatherDescriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Foggy',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
      };

      const weatherDescription = weatherDescriptions[current.weather_code] || 'Unknown';

      return {
        location: `${name}, ${country}`,
        temperature: `${current.temperature_2m}°C`,
        feels_like: `${current.apparent_temperature}°C`,
        humidity: `${current.relative_humidity_2m}%`,
        conditions: weatherDescription,
        wind_speed: `${current.wind_speed_10m} km/h`,
        precipitation: `${current.precipitation} mm`,
        summary: `Weather in ${name}, ${country}: ${weatherDescription}, ${current.temperature_2m}°C (feels like ${current.apparent_temperature}°C), humidity ${current.relative_humidity_2m}%, wind ${current.wind_speed_10m} km/h`,
      };
    } catch (error) {
      return {
        error: `Weather lookup failed: ${error.message}`,
        location: args.location,
      };
    }
  },
};
