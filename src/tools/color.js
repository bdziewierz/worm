export const colorTool = {
  name: 'convert_color',
  description: 'Convert colors between formats (hex, RGB, HSL) and get color info',
  category: 'utility',
  keywords: ['color', 'hex', 'rgb', 'hsl', 'convert', 'palette'],
  parameters: {
    type: 'object',
    properties: {
      color: {
        type: 'string',
        description: 'Color in hex (#FF5733), RGB (rgb(255,87,51)), or HSL (hsl(9,100%,60%))'
      }
    },
    required: ['color']
  },
  execute: async (args) => {
    try {
      const { color } = args;

      let r, g, b;

      // Parse hex
      if (color.match(/^#?[0-9A-Fa-f]{6}$/)) {
        const hex = color.replace('#', '');
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      }
      // Parse rgb
      else if (color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)) {
        const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        r = parseInt(match[1]);
        g = parseInt(match[2]);
        b = parseInt(match[3]);
      }
      // Parse hsl
      else if (color.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/)) {
        const match = color.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/);
        const h = parseInt(match[1]) / 360;
        const s = parseInt(match[2]) / 100;
        const l = parseInt(match[3]) / 100;

        // HSL to RGB conversion
        const hslToRgb = (h, s, l) => {
          let r, g, b;
          if (s === 0) {
            r = g = b = l;
          } else {
            const hue2rgb = (p, q, t) => {
              if (t < 0) t += 1;
              if (t > 1) t -= 1;
              if (t < 1/6) return p + (q - p) * 6 * t;
              if (t < 1/2) return q;
              if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
              return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
          }
          return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        };

        [r, g, b] = hslToRgb(h, s, l);
      } else {
        return {
          error: 'Invalid color format. Use hex (#FF5733), RGB (rgb(255,87,51)), or HSL (hsl(9,100%,60%))'
        };
      }

      // RGB to HSL conversion
      const rgbToHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
          }
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
      };

      const [h, s, l] = rgbToHsl(r, g, b);

      return {
        hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase(),
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${h}, ${s}%, ${l}%)`,
        values: {
          r, g, b, h, s, l
        },
        summary: `HEX: #${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')} | RGB: (${r}, ${g}, ${b}) | HSL: (${h}°, ${s}%, ${l}%)`
      };

    } catch (error) {
      return {
        error: `Color conversion failed: ${error.message}`
      };
    }
  }
};
