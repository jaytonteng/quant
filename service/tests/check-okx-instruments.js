/**
 * 查询OKX实盘和模拟盘的可用币种
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto-js');

async function checkInstruments() {
  console.log('🔍 查询OKX可用币种...\n');

  try {
    // 1. 查询实盘币种
    console.log('📊 查询实盘币种...');
    const realInstruments = await getInstruments(false);
    console.log(`✅ 实盘永续合约: ${realInstruments.length} 个\n`);

    // 2. 查询模拟盘币种
    console.log('🎮 查询模拟盘币种...');
    const demoInstruments = await getInstruments(true);
    console.log(`✅ 模拟盘永续合约: ${demoInstruments.length} 个\n`);

    // 3. 分析币种差异
    console.log('📈 币种差异分析:');
    const realSymbols = new Set(realInstruments.map(i => i.instId));
    const demoSymbols = new Set(demoInstruments.map(i => i.instId));
    
    const onlyInReal = [...realSymbols].filter(s => !demoSymbols.has(s));
    const onlyInDemo = [...demoSymbols].filter(s => !realSymbols.has(s));
    
    console.log(`   实盘独有: ${onlyInReal.length} 个`);
    console.log(`   模拟盘独有: ${onlyInDemo.length} 个\n`);

    // 4. 分类币种
    console.log('🏷️ 币种分类:');
    const { mainstream, altcoins } = classifyCoins(realInstruments);
    
    console.log(`   主流币: ${mainstream.length} 个`);
    mainstream.forEach(coin => console.log(`     ${coin.instId} - ${coin.baseCcy}`));
    
    console.log(`\n   小币种: ${altcoins.length} 个`);
    altcoins.slice(0, 20).forEach(coin => console.log(`     ${coin.instId} - ${coin.baseCcy}`));
    if (altcoins.length > 20) {
      console.log(`     ... 还有 ${altcoins.length - 20} 个小币种`);
    }

    // 5. 推荐小币种防爆策略币种
    console.log('\n🎯 推荐小币种防爆策略币种:');
    const recommended = altcoins.filter(coin => {
      const baseCcy = coin.instId.split('-')[0];
      // 排除一些可能比较稳定的币种
      const excludeList = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'LUSD'];
      return !excludeList.includes(baseCcy) && 
             !baseCcy.includes('USD') && 
             baseCcy.length <= 6; // 排除过长的币种名
    }).slice(0, 15); // 取前15个

    recommended.forEach(coin => console.log(`     ${coin.instId}`));

    return {
      real: realInstruments,
      demo: demoInstruments,
      mainstream,
      altcoins,
      recommended
    };

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
  }
}

async function getInstruments(simulated = false) {
  const baseUrl = 'https://www.okx.com';
  const endpoint = '/api/v5/public/instruments';
  
  const params = {
    instType: 'SWAP',
    state: 'live'
  };

  try {
    const response = await axios.get(baseUrl + endpoint, { params });
    
    if (response.data.code === '0') {
      return response.data.data || [];
    } else {
      throw new Error(`API Error: ${response.data.msg}`);
    }
  } catch (error) {
    console.error(`获取${simulated ? '模拟盘' : '实盘'}币种失败:`, error.message);
    return [];
  }
}

function classifyCoins(instruments) {
  // 主流币定义
  const mainstreamCoins = [
    'BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOT', 'DOGE', 'AVAX', 'MATIC',
    'LTC', 'LINK', 'UNI', 'ATOM', 'XLM', 'BCH', 'ALGO', 'VET', 'ICP', 'FIL',
    'TRX', 'ETC', 'XMR', 'EOS', 'AAVE', 'SUSHI', 'COMP', 'MKR', 'YFI', 'SNX',
    'OKB', 'HT', 'FTT', 'LEO', 'CRO', 'KCS', 'BTT', 'WAVES', 'ZEC', 'DASH'
  ];

  const mainstream = [];
  const altcoins = [];

  instruments.forEach(inst => {
    // 从instId中提取币种名，如 BTC-USDT-SWAP -> BTC
    const baseCcy = inst.instId.split('-')[0];
    if (mainstreamCoins.includes(baseCcy)) {
      mainstream.push(inst);
    } else {
      altcoins.push(inst);
    }
  });

  return { mainstream, altcoins };
}

// 运行查询
checkInstruments().then(result => {
  if (result) {
    console.log('\n✅ 查询完成！');
    console.log('💡 建议: 使用推荐的小币种列表更新市场过滤器');
  }
}).catch(console.error);
