require('dotenv').config({ path: '../../../../.env' });
const TwitterAIAnalyzer = require('../../ai/twitter-ai-analyzer');

async function testAIAnalyzer() {
  console.log('🧪 测试Twitter AI分析器...\n');

  const analyzer = new TwitterAIAnalyzer();
  
  try {
    console.time('AI分析器初始化');
    await analyzer.initialize();
    console.timeEnd('AI分析器初始化');

    // 测试推文数据
    const testTweets = [
      {
        id: 'test_1',
        text: 'Bitcoin is going to the moon! 🚀 This is the future of money.',
        timestamp: Date.now()
      },
      {
        id: 'test_2', 
        text: 'The Fed is raising interest rates again. This will crash the crypto market.',
        timestamp: Date.now()
      },
      {
        id: 'test_3',
        text: 'Just had a great meeting with Tesla team about our new electric vehicle plans.',
        timestamp: Date.now()
      }
    ];

    const testConfigs = [
      {
        username: 'elonmusk',
        ai_analysis: {
          enabled: true,
          model: 'gpt-4',
          prompt_template: '分析这条推文对加密货币市场的潜在影响'
        }
      },
      {
        username: 'federalreserve',
        ai_analysis: {
          enabled: true,
          model: 'gpt-4',
          prompt_template: '分析这条推文对全球金融市场的潜在影响'
        }
      },
      {
        username: 'realDonaldTrump',
        ai_analysis: {
          enabled: true,
          model: 'gpt-4',
          prompt_template: '分析这条推文对政治和经济市场的潜在影响'
        }
      }
    ];

    console.log('\n🤖 开始AI分析测试...\n');

    for (let i = 0; i < testTweets.length; i++) {
      const tweet = testTweets[i];
      const config = testConfigs[i];
      
      console.log(`📝 测试推文 ${i + 1}:`);
      console.log(`   用户: @${config.username}`);
      console.log(`   内容: ${tweet.text}`);
      
      console.time(`AI分析 ${i + 1}`);
      const analysis = await analyzer.analyzeTweet(tweet, config);
      console.timeEnd(`AI分析 ${i + 1}`);
      
      console.log(`   情感: ${analysis.sentiment}`);
      console.log(`   市场影响: ${analysis.marketImpact}`);
      console.log(`   置信度: ${analysis.confidence.toFixed(2)}`);
      console.log(`   风险等级: ${analysis.riskLevel}`);
      console.log(`   关键词: ${analysis.keywords.join(', ')}`);
      console.log(`   分析结果: ${analysis.analysis}`);
      console.log('');
    }

    console.log('🎉 AI分析器测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

testAIAnalyzer();
