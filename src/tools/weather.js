export const weatherTool = {
  name: 'get_weather',
  description: 'Get weather for a location (mock data)',
  category: 'weather',
  keywords: ['weather', 'temperature', 'forecast', 'climate', 'hot', 'cold', 'rain'],
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city or location to get weather for (e.g., "London", "New York")'
      }
    },
    required: ['location']
  },
  execute: async (args) => {
    const { location } = args;

    // Mock weather data - replace with real API in production
    const mockWeatherData = {
      location: location,
      temp_c: Math.floor(Math.random() * 30) + 10,
      conditions: ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 40) + 40,
      wind_kph: Math.floor(Math.random() * 20) + 5
    };

    return mockWeatherData;
  }
};
