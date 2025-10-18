require('dotenv').config({ path: '../../../../.env' });
const BinanceScraper = require('../../monitors/binance-scraper');

async function testBinance() {
  console.log('🧪 测试币安爬虫 (带计时)...\n');

  const scraper = new BinanceScraper();
  const startTime = Date.now();
  
  try {
    console.time('API请求+数据处理');
    const listings = await scraper.getNewListings();
    console.timeEnd('API请求+数据处理');
    
    if (listings.length === 0) {
      console.log('❌ 未获取到新币公告');
      return;
    }

    console.log(`✅ 成功获取 ${listings.length} 条新币公告:\n`);
    
    listings.forEach((listing, index) => {
      console.log(`📝 公告 ${index + 1}:`);
      console.log(`   ID: ${listing.id}`);
      console.log(`   币种: ${listing.coins.join(', ')}`);
      console.log(`   标题: ${listing.title}`);
      console.log(`   时间: ${new Date(listing.releaseDate).toLocaleString()}`);
      console.log(`   来源: ${listing.source}`);
      console.log('');
    });

    console.log('🎉 币安爬虫测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    const totalTime = Date.now() - startTime;
    console.log(`⏱️  总耗时: ${totalTime}ms`);
  }
}

testBinance();
