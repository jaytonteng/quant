require('dotenv').config({ path: '../../../../.env' });
const UpbitScraper = require('../../monitors/upbit-scraper');

async function testUpbit() {
  console.log('🧪 测试Upbit爬虫 (带计时)...\n');

  const scraper = new UpbitScraper();
  const startTime = Date.now();
  
  try {
    console.time('浏览器初始化');
    await scraper.initialize();
    console.timeEnd('浏览器初始化');

    console.time('页面加载+数据提取');
    const listings = await scraper.getNewListings();
    console.timeEnd('页面加载+数据提取');
    
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

    console.log('🎉 Upbit爬虫测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    console.time('浏览器关闭');
    await scraper.close();
    console.timeEnd('浏览器关闭');
    const totalTime = Date.now() - startTime;
    console.log(`⏱️  总耗时: ${totalTime}ms`);
  }
}

testUpbit();
