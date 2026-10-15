'use strict';

const https = require('https');
const crypto = require('crypto');

// likes per stock: { GOOG: Set of hashed IPs }
const likes = {};

// store a hash of the IP instead of the raw IP (privacy requirement)
const anonymize = (ip) => crypto.createHash('sha256').update(String(ip)).digest('hex');

// get the latest price from freeCodeCamp's stock proxy
function getPrice(symbol) {
  const url = `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${encodeURIComponent(symbol)}/quote`;
  return new Promise((resolve) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => (data += chunk));
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(typeof json.latestPrice === 'number' ? json.latestPrice : null);
        } catch (e) {
          resolve(null); // e.g. "Unknown symbol"
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function getStockData(stock, like, ip) {
  const symbol = String(stock).toUpperCase();
  if (!likes[symbol]) likes[symbol] = new Set();
  if (like) likes[symbol].add(anonymize(ip)); // a Set keeps it to one like per IP

  const price = await getPrice(symbol);
  const data = { stock: symbol, likes: likes[symbol].size };
  if (price === null) data.error = 'external source error';
  else data.price = price;
  return data;
}

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(async function (req, res) {
      const { stock } = req.query;
      const like = req.query.like === 'true' || req.query.like === true;

      if (!stock) return res.json({ error: 'stock is required' });

      // one stock
      if (!Array.isArray(stock)) {
        const data = await getStockData(stock, like, req.ip);
        return res.json({ stockData: data });
      }

      // two stocks: show relative likes instead of likes
      const [a, b] = await Promise.all(stock.slice(0, 2).map(s => getStockData(s, like, req.ip)));
      const toRel = (x, other) => {
        const { likes: l, ...rest } = x;
        return { ...rest, rel_likes: l - other.likes };
      };
      res.json({ stockData: [toRel(a, b), toRel(b, a)] });
    });

};
