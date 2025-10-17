require('dotenv').config();
const OKXClient = require('../shared/okx-api');
const MarketFilter = require('../shared/market-filter');

async function verify() {
  console.log('🔍 验证市场过滤算法\n');

  const okx = new OKXClient();
  const filter = new MarketFilter(okx);

  // 检测当前市场状态
  const regime = await filter.detectMarketRegime();

  console.log('📊 当前市场状态');
  console.log('='.repeat(70));
  console.log(`   Level: ${regime.level}`);
  console.log(`   原因: ${regime.reason}`);
  console.log(`   建议: ${regime.recommendation}\n`);

  console.log('📈 详细数据');
  console.log('='.repeat(70));
  console.log(`   BTC 24h变化: ${regime.details.btcPriceChange}%`);
  console.log(`   ETH 24h变化: ${regime.details.ethPriceChange}%`);
  console.log(`   BTC ATR%: ${regime.details.btcATR}%`);
  console.log(`   BTC MA偏离: ${regime.details.btcDeviation}%`);
  console.log(`\n   🔥 小币种联动性:`);
  console.log(`   下跌>5%的币种: ${regime.details.droppingCoins} (${regime.details.altcoinDropPct}%)`);
  console.log(`   上涨>5%的币种: ${regime.details.risingCoins} (${regime.details.altcoinRisePct}%)\n`);

  console.log('⚙️  判断标准');
  console.log('='.repeat(70));
  console.log(`   Level 2 极端: 70%币种联动 OR BTC/ETH 24h>8%`);
  console.log(`   Level 1 高波动: 50%币种联动 OR BTC/ETH 24h>5%`);
  console.log(`   Level 0 正常: 以上均不满足\n`);

  console.log('✅ 验证完成');
}

verify().catch(console.error);
