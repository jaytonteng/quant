require('dotenv').config({ path: '../../../../.env' });
const PuppeteerTwitterScraper = require('../../../../shared/puppeteer-twitter-scraper');

async function testCoinbase() {
  console.log('🧪 测试Coinbase Twitter爬虫 (带计时)...\n');

  const scraper = new PuppeteerTwitterScraper();
  const keywords = ['Assets added to the roadmap today'];
  const startTime = Date.now();
  
  try {
    console.time('浏览器初始化');
    await scraper.initialize();
    console.timeEnd('浏览器初始化');

    console.time('获取推文');
    const tweets = await scraper.getUserTweets('CoinbaseAssets', 10);
    console.timeEnd('获取推文');

    console.time('关键词过滤');
    const filteredTweets = scraper.filterTweetsByKeywords(tweets, keywords);
    console.timeEnd('关键词过滤');
    
    if (filteredTweets.length === 0) {
      console.log('❌ 未获取到相关推文');
      return;
    }

    console.log(`✅ 成功获取 ${filteredTweets.length} 条相关推文:\n`);
    
    filteredTweets.forEach((tweet, index) => {
      console.log(`📝 推文 ${index + 1}:`);
      console.log(`   ID: ${tweet.id}`);
      console.log(`   时间: ${new Date(tweet.timestamp).toLocaleString()}`);
      console.log(`   内容: ${tweet.text}`);
      console.log(`   互动: 👍${tweet.likes} 🔄${tweet.retweets} 💬${tweet.replies}`);
      console.log('');
    });

    console.log('🎉 Coinbase Twitter爬虫测试完成！');

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

testCoinbase();
