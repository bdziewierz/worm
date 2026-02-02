export const cryptoPriceTool = {
  name: 'get_crypto_price',
  description: 'Get current cryptocurrency prices and market data',
  category: 'finance',
  keywords: ['crypto', 'bitcoin', 'ethereum', 'price', 'cryptocurrency', 'btc', 'eth'],
  parameters: {
    type: 'object',
    properties: {
      coin: {
        type: 'string',
        description: 'Cryptocurrency symbol or name (e.g., "bitcoin", "btc", "ethereum", "eth")',
      },
      currency: {
        type: 'string',
        description: 'Target currency (default: "usd", options: "usd", "eur", "gbp")',
      },
    },
    required: ['coin'],
  },
  execute: async args => {
    try {
      const { coin, currency = 'usd' } = args;
      const coinId = coin.toLowerCase();

      // Map common symbols to CoinGecko IDs
      const coinMap = {
        btc: 'bitcoin',
        eth: 'ethereum',
        usdt: 'tether',
        bnb: 'binancecoin',
        sol: 'solana',
        xrp: 'ripple',
        usdc: 'usd-coin',
        ada: 'cardano',
        doge: 'dogecoin',
        dot: 'polkadot',
      };

      const coinName = coinMap[coinId] || coinId;

      // CoinGecko public API (no key required)
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinName}&vs_currencies=${currency}&include_24hr_change=true&include_market_cap=true`;
      const response = await fetch(url);

      if (!response.ok) {
        return { error: 'Failed to fetch crypto price' };
      }

      const data = await response.json();

      if (!data[coinName]) {
        return {
          error: `Cryptocurrency "${coin}" not found. Try full name (e.g., "bitcoin", "ethereum")`,
          suggestion: 'Common coins: bitcoin (btc), ethereum (eth), solana (sol), ripple (xrp)',
        };
      }

      const priceData = data[coinName];
      const price = priceData[currency];
      const change24h = priceData[`${currency}_24h_change`];
      const marketCap = priceData[`${currency}_market_cap`];

      const changeSymbol = change24h >= 0 ? '📈' : '📉';
      const changeFormatted =
        change24h >= 0 ? `+${change24h.toFixed(2)}%` : `${change24h.toFixed(2)}%`;

      return {
        coin: coinName,
        price: price,
        currency: currency.toUpperCase(),
        change_24h: change24h.toFixed(2) + '%',
        market_cap: marketCap,
        summary: `${coinName.charAt(0).toUpperCase() + coinName.slice(1)}: ${price.toLocaleString()} ${currency.toUpperCase()} ${changeSymbol} ${changeFormatted} (24h)`,
      };
    } catch (error) {
      return {
        error: `Crypto price lookup failed: ${error.message}`,
        coin: args.coin,
      };
    }
  },
};
