// The fixed universe and dates of PROTOCOL-swing.md §2–4. Changing anything here after
// results exist is exactly what the protocol forbids.

export const CUTOFF = '2026-10-05'
export const SPLIT = '2018-01-01'

export const UNIVERSE = [
  { symbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin', group: 'crypto' },
  { symbol: 'BITSTAMP:ETHUSD', name: 'Ethereum', group: 'crypto' },
  { symbol: 'BITSTAMP:LTCUSD', name: 'Litecoin', group: 'crypto' },
  { symbol: 'BITSTAMP:XRPUSD', name: 'XRP', group: 'crypto' },
  { symbol: 'AMEX:SPY', name: 'S&P 500 ETF', group: 'us' },
  { symbol: 'NASDAQ:QQQ', name: 'Nasdaq 100 ETF', group: 'us' },
  { symbol: 'AMEX:IWM', name: 'Russell 2000 ETF', group: 'us' },
  { symbol: 'NASDAQ:AAPL', name: 'Apple', group: 'us' },
  { symbol: 'NASDAQ:MSFT', name: 'Microsoft', group: 'us' },
  { symbol: 'NASDAQ:AMZN', name: 'Amazon', group: 'us' },
  { symbol: 'NASDAQ:GOOGL', name: 'Alphabet', group: 'us' },
  { symbol: 'NASDAQ:NVDA', name: 'Nvidia', group: 'us' },
  { symbol: 'NYSE:JPM', name: 'JPMorgan', group: 'us' },
  { symbol: 'NYSE:XOM', name: 'Exxon Mobil', group: 'us' },
  { symbol: 'NYSE:JNJ', name: 'Johnson & Johnson', group: 'us' },
  { symbol: 'NYSE:PG', name: 'Procter & Gamble', group: 'us' },
  { symbol: 'NYSE:KO', name: 'Coca-Cola', group: 'us' },
  // Walmart moved its listing from NYSE to Nasdaq in December 2025; the connector serves
  // the full history under the new prefix.
  { symbol: 'NASDAQ:WMT', name: 'Walmart', group: 'us' },
  { symbol: 'NASDAQ:INTC', name: 'Intel', group: 'us' },
  { symbol: 'NYSE:BA', name: 'Boeing', group: 'us' },
  { symbol: 'NYSE:DIS', name: 'Disney', group: 'us' },
  { symbol: 'NYSE:PFE', name: 'Pfizer', group: 'us' },
  { symbol: 'NYSE:GE', name: 'GE Aerospace', group: 'us' },
  { symbol: 'NYSE:C', name: 'Citigroup', group: 'us' },
  { symbol: 'NYSE:T', name: 'AT&T', group: 'us' },
  { symbol: 'NYSE:IBM', name: 'IBM', group: 'us' },
  { symbol: 'NYSE:F', name: 'Ford', group: 'us' },
  { symbol: 'TADAWUL:TASI', name: 'TASI index', group: 'saudi' },
  { symbol: 'TADAWUL:1120', name: 'Al Rajhi Bank', group: 'saudi' },
  { symbol: 'TADAWUL:2010', name: 'SABIC', group: 'saudi' },
  { symbol: 'TADAWUL:7010', name: 'STC', group: 'saudi' },
  { symbol: 'TADAWUL:1180', name: 'Saudi National Bank', group: 'saudi' },
  { symbol: 'TADAWUL:2222', name: 'Saudi Aramco', group: 'saudi' },
]
