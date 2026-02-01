export const convertTool = {
  name: 'convert_units',
  description: 'Convert between different units (temperature, distance, weight, volume)',
  category: 'utility',
  keywords: ['convert', 'unit', 'celsius', 'fahrenheit', 'miles', 'kilometers', 'pounds', 'kilograms'],
  parameters: {
    type: 'object',
    properties: {
      value: {
        type: 'number',
        description: 'The numeric value to convert'
      },
      from_unit: {
        type: 'string',
        description: 'Source unit (e.g., "celsius", "miles", "pounds", "liters")'
      },
      to_unit: {
        type: 'string',
        description: 'Target unit (e.g., "fahrenheit", "kilometers", "kilograms", "gallons")'
      }
    },
    required: ['value', 'from_unit', 'to_unit']
  },
  execute: async (args) => {
    try {
      const { value, from_unit, to_unit } = args;
      const from = from_unit.toLowerCase();
      const to = to_unit.toLowerCase();

      // Conversion rules
      const conversions = {
        // Temperature
        'celsius->fahrenheit': (v) => (v * 9/5) + 32,
        'fahrenheit->celsius': (v) => (v - 32) * 5/9,
        'celsius->kelvin': (v) => v + 273.15,
        'kelvin->celsius': (v) => v - 273.15,
        'fahrenheit->kelvin': (v) => (v - 32) * 5/9 + 273.15,
        'kelvin->fahrenheit': (v) => (v - 273.15) * 9/5 + 32,

        // Distance
        'miles->kilometers': (v) => v * 1.60934,
        'kilometers->miles': (v) => v / 1.60934,
        'meters->feet': (v) => v * 3.28084,
        'feet->meters': (v) => v / 3.28084,
        'inches->centimeters': (v) => v * 2.54,
        'centimeters->inches': (v) => v / 2.54,

        // Weight
        'pounds->kilograms': (v) => v * 0.453592,
        'kilograms->pounds': (v) => v / 0.453592,
        'ounces->grams': (v) => v * 28.3495,
        'grams->ounces': (v) => v / 28.3495,

        // Volume
        'gallons->liters': (v) => v * 3.78541,
        'liters->gallons': (v) => v / 3.78541,
        'cups->milliliters': (v) => v * 236.588,
        'milliliters->cups': (v) => v / 236.588,
      };

      const key = `${from}->${to}`;
      const converter = conversions[key];

      if (!converter) {
        return {
          error: `Cannot convert from ${from_unit} to ${to_unit}. Unsupported conversion.`,
          supported: 'temperature (celsius, fahrenheit, kelvin), distance (miles, kilometers, meters, feet, inches, cm), weight (pounds, kg, ounces, grams), volume (gallons, liters, cups, ml)'
        };
      }

      const result = converter(value);

      return {
        input: `${value} ${from_unit}`,
        output: `${result.toFixed(2)} ${to_unit}`,
        conversion: `${value} ${from_unit} = ${result.toFixed(2)} ${to_unit}`
      };

    } catch (error) {
      return {
        error: `Conversion failed: ${error.message}`
      };
    }
  }
};
