require('dotenv').config({ path: '../../../../.env' });
const TwitterAccountManager = require('../../monitors/twitter-account-manager');

async function testTwitterManager() {
  console.log('🧪 测试Twitter账号管理器...\n');

  const manager = new TwitterAccountManager();
  
  try {
    console.time('管理器初始化');
    await manager.initialize();
    console.timeEnd('管理器初始化');

    console.log('\n📊 配置信息:');
    const config = manager.config;
    console.log(`- 总配置账号数: ${Object.keys(config.monitors).length}`);
    console.log(`- 启用账号数: ${Object.values(config.monitors).filter(m => m.enabled).length}`);
    console.log(`- 最大并发监听: ${config.global_settings.max_concurrent_monitors}`);
    
    console.log('\n🎯 启用的监听器:');
    Object.entries(config.monitors).forEach(([id, monitor]) => {
      if (monitor.enabled) {
        console.log(`- ${id}: @${monitor.username} (${monitor.frequency}ms) - ${monitor.strategy}`);
      }
    });

    console.log('\n🚀 启动监听器 (测试5秒)...');
    await manager.startAllMonitors();
    
    // 等待5秒观察监听效果
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n📈 统计信息:');
    const stats = manager.getStats();
    console.log(`- 活跃监听器: ${stats.activeMonitors}`);
    console.log(`- 总推文数: ${stats.totalTweets}`);
    console.log(`- 已处理推文: ${stats.processedTweets}`);
    console.log(`- AI分析推文: ${stats.aiAnalyzedTweets}`);
    console.log(`- 错误次数: ${stats.errors}`);

    console.log('\n🛑 停止监听器...');
    manager.stopAllMonitors();

    console.log('🎉 Twitter账号管理器测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    console.time('管理器关闭');
    await manager.close();
    console.timeEnd('管理器关闭');
  }
}

testTwitterManager();
