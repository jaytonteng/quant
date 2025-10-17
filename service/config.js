require('dotenv').config();

module.exports = {
  // OKX API 配置
  okx: {
    // 根据 OKX_SIMULATED 选择使用模拟盘或实盘的 API Key
    apiKey: process.env.OKX_SIMULATED === '1' 
      ? (process.env.OKX_FAKE_KEY || process.env.OKX_API_KEY)
      : process.env.OKX_API_KEY,
    secretKey: process.env.OKX_SIMULATED === '1'
      ? (process.env.OKX_FAKE_SECRET || process.env.OKX_SECRET_KEY)
      : process.env.OKX_SECRET_KEY,
    passphrase: process.env.OKX_SIMULATED === '1'
      ? (process.env.OKX_FAKE_PASSPHRASE || process.env.OKX_PASSPHRASE)
      : process.env.OKX_PASSPHRASE,
    simulated: process.env.OKX_SIMULATED === '1',
    baseUrl: 'https://www.okx.com'
  },

  // Webhook 服务器配置
  server: {
    port: parseInt(process.env.PORT) || 3001,
    webhookSecret: process.env.WEBHOOK_SECRET || 'default_secret_change_me'
  },

  // 风控参数
  risk: {
    maxConcurrentPositions: parseInt(process.env.MAX_CONCURRENT_POSITIONS) || 3,
    singleSymbolMaxMarginPct: parseFloat(process.env.SINGLE_SYMBOL_MAX_MARGIN_PCT) || 20,
    accountDrawdownStopPct: parseFloat(process.env.ACCOUNT_DRAWDOWN_STOP_PCT) || 20,
    btcAtrThreshold: parseFloat(process.env.BTC_ATR_THRESHOLD) || 6.0
  },

  // 本地文件路径
  storage: {
    positionsFile: './data/positions.json',
    tradesFile: './data/trades.json',
    configFile: './data/config.json'
  }
};

