require('dotenv').config({ path: '../../../../.env' });
const PuppeteerTwitterScraper = require('../../../../shared/puppeteer-twitter-scraper');
const fs = require('fs');
const path = require('path');

async function testAllTwitterAccounts() {
  console.log('🧪 测试所有目标Twitter账号...\n');

  // 加载Twitter监听配置
  const configPath = path.join(__dirname, '../../config/twitter-monitors.json');
  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);

  const enabledAccounts = Object.entries(config.monitors)
    .filter(([_, monitorConfig]) => monitorConfig.enabled)
    .map(([id, monitorConfig]) => ({
      id,
      username: monitorConfig.username,
      description: monitorConfig.description
    }));

  console.log(`📊 找到 ${enabledAccounts.length} 个启用的Twitter账号:\n`);
  enabledAccounts.forEach((account, index) => {
    console.log(`${index + 1}. @${account.username} - ${account.description}`);
  });
  console.log('');

  const scraper = new PuppeteerTwitterScraper();
  const totalStartTime = Date.now();
  const results = [];

  try {
    console.time('浏览器初始化');
    await scraper.initialize();
    console.timeEnd('浏览器初始化');

    console.log('\n🚀 开始获取推文...\n');

    // 逐个获取每个账号的推文
    for (let i = 0; i < enabledAccounts.length; i++) {
      const account = enabledAccounts[i];
      const accountStartTime = Date.now();
      
      console.log(`📱 [${i + 1}/${enabledAccounts.length}] 获取 @${account.username} 的推文...`);
      
      try {
        console.time(`获取 @${account.username}`);
        const tweets = await scraper.getUserTweets(account.username, 5);
        console.timeEnd(`获取 @${account.username}`);
        
        const accountDuration = Date.now() - accountStartTime;
        
        results.push({
          account: account,
          tweets: tweets,
          duration: accountDuration,
          success: true
        });

        console.log(`✅ @${account.username}: 获取到 ${tweets.length} 条推文 (${accountDuration}ms)\n`);

        // 显示推文内容
        if (tweets.length > 0) {
          tweets.forEach((tweet, index) => {
            console.log(`   📝 推文 ${index + 1}:`);
            console.log(`      ID: ${tweet.id}`);
            console.log(`      时间: ${new Date(tweet.timestamp).toLocaleString()}`);
            console.log(`      内容: ${tweet.text.substring(0, 100)}${tweet.text.length > 100 ? '...' : ''}`);
            console.log(`      互动: 👍${tweet.likes} 🔄${tweet.retweets} 💬${tweet.replies}`);
            console.log('');
          });
        } else {
          console.log('   ⚠️ 未获取到推文\n');
        }

      } catch (error) {
        const accountDuration = Date.now() - accountStartTime;
        console.log(`❌ @${account.username}: 获取失败 - ${error.message} (${accountDuration}ms)\n`);
        
        results.push({
          account: account,
          tweets: [],
          duration: accountDuration,
          success: false,
          error: error.message
        });
      }

      // 添加延迟避免被限制
      if (i < enabledAccounts.length - 1) {
        console.log('⏳ 等待2秒避免频率限制...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 显示汇总结果
    const totalDuration = Date.now() - totalStartTime;
    const successfulAccounts = results.filter(r => r.success).length;
    const totalTweets = results.reduce((sum, r) => sum + r.tweets.length, 0);

    console.log('📊 汇总结果:');
    console.log(`   总账号数: ${enabledAccounts.length}`);
    console.log(`   成功获取: ${successfulAccounts}`);
    console.log(`   失败账号: ${enabledAccounts.length - successfulAccounts}`);
    console.log(`   总推文数: ${totalTweets}`);
    console.log(`   总耗时: ${totalDuration}ms`);
    console.log(`   平均耗时: ${Math.round(totalDuration / enabledAccounts.length)}ms/账号`);

    console.log('\n📈 各账号详细统计:');
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const tweetCount = result.tweets.length;
      const duration = result.duration;
      console.log(`   ${index + 1}. ${status} @${result.account.username}: ${tweetCount}条推文, ${duration}ms`);
    });

    console.log('\n🎉 所有Twitter账号测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    console.time('浏览器关闭');
    await scraper.close();
    console.timeEnd('浏览器关闭');
  }
}

testAllTwitterAccounts();
