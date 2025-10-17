const { chromium } = require('playwright');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs')
const path = require('path');               // 引入 path 模块

puppeteer.use(StealthPlugin());


const wait = async(page, time, text)  => {
  await page.waitForTimeout(time); // 等待两秒以更像人类用户
  if (text) {
    console.log(text)
  }
}

const hideTrack = async(page) => {

    // 隐藏自动化工具的迹象
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
      });
      // 移除Chrome版本间的特定特性
      window.chrome = {
          runtime: {},
          // 可能还需要更多属性和方法
      };
      // 欺骗一些常用的属性
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
          parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
      });
  });
}

const deleteAlertsByStrategy = async(page, context, strategyName) => {
  console.log(`开始删除策略 "${strategyName}" 的所有警报...`);
  
  let totalDeletedCount = 0;
  let hasMoreAlerts = true;
  let roundCount = 0;
  
  while (hasMoreAlerts) {
    roundCount++;
    console.log(`\n=== 第 ${roundCount} 轮检查 ===`);
    
    try {
      // 等待警报列表容器出现
      await page.waitForSelector('.list-G90Hl2iS', { state: 'visible', timeout: 10000 });
      console.log('警报列表容器已加载');
      
      // 等待页面稳定
      await wait(page, 2000);
      
      // 获取所有警报项
      const alertItems = await page.$$('.itemBody-ucBqatk5');
      console.log(`找到 ${alertItems.length} 个警报项`);
      
      if (alertItems.length === 0) {
        console.log('没有找到任何警报项，结束删除任务');
        hasMoreAlerts = false;
        break;
      }
      
      let roundDeletedCount = 0;
      let foundMatchingAlert = false;
      
      // 遍历每个警报项
      for (let i = 0; i < alertItems.length; i++) {
        try {
          const item = alertItems[i];
          
          // 获取警报名称
          const nameElement = await item.$('.name-Bj96_lIl');
          if (!nameElement) {
            console.log(`第 ${i + 1} 个警报项没有找到名称元素，跳过`);
            continue;
          }
          
          const alertName = await nameElement.textContent();
          console.log(`检查第 ${i + 1} 个警报: "${alertName}"`);
          
          // 检查是否匹配策略名称
          if (alertName && alertName.includes(strategyName)) {
            foundMatchingAlert = true;
            console.log(`找到匹配的警报: "${alertName}"，准备删除...`);
            
            // 悬停到警报项上
            await item.hover();
            await wait(page, 1000);
            
            // 等待删除按钮出现
            const deleteButton = await item.$('div[data-name="alert-delete-button"]');
            if (deleteButton) {
              console.log('删除按钮已出现，点击删除...');
              await deleteButton.click();
              await wait(page, 1000);
              
              // 等待确认弹窗出现
              await page.waitForSelector('div[data-name="confirm-dialog"]', { state: 'visible', timeout: 5000 });
              console.log('确认弹窗已出现');
              
              // 点击确认删除按钮
              const confirmDeleteButton = await page.$('button[name="yes"][data-overflow-tooltip-text="Delete"]');
              if (confirmDeleteButton) {
                await confirmDeleteButton.click();
                console.log('已点击确认删除按钮');
                roundDeletedCount++;
                totalDeletedCount++;
                
                // 等待弹窗消失
                await wait(page, 1000);
                
                // 重新获取警报列表（因为删除后列表会变化）
                await wait(page, 1000);
                const newAlertItems = await page.$$('.itemBody-ucBqatk5');
                console.log(`删除后剩余 ${newAlertItems.length} 个警报项`);
                
                // 更新警报项数组
                alertItems.splice(i, 1);
                i--; // 重新检查当前位置
              } else {
                console.log('未找到确认删除按钮');
              }
            } else {
              console.log('未找到删除按钮');
            }
          } else {
            console.log(`警报 "${alertName}" 不匹配策略 "${strategyName}"，跳过`);
          }
          
          await wait(page, 500);
          
        } catch (error) {
          console.log(`处理第 ${i + 1} 个警报项时出错: ${error.message}`);
          continue;
        }
      }
      
      console.log(`第 ${roundCount} 轮删除完成，本轮删除了 ${roundDeletedCount} 个匹配的警报`);
      
      // 如果没有找到匹配的警报，结束循环
      if (!foundMatchingAlert) {
        console.log('本轮没有找到匹配的警报，结束删除任务');
        hasMoreAlerts = false;
      }
      
      // 等待一段时间再进行下一轮检查
      if (hasMoreAlerts) {
        console.log('等待 3 秒后进行下一轮检查...');
        await wait(page, 3000);
      }
      
    } catch (error) {
      console.log(`第 ${roundCount} 轮检查时发生错误: ${error.message}`);
      hasMoreAlerts = false;
    }
  }
  
  console.log(`\n删除任务完成！总共删除了 ${totalDeletedCount} 个匹配的警报，进行了 ${roundCount} 轮检查`);
}

const initPage = async () => {
    const browser = await chromium.connectOverCDP({
      endpointURL: 'http://localhost:9999'
  });

  // 获取当前所有的上下文
  const contexts = browser.contexts();
  const context = contexts[0]; // 取第一个上下文，通常是默认上下文

    // 打开新页面
    const page = await context.newPage();
    const stealthScript = fs.readFileSync(path.join(__dirname, 'stealth.min.js'), 'utf8');
    await page.addInitScript(stealthScript); // 注入 stealth.min.js

    await hideTrack(page)

    // 导航到TradingView页面
    await page.goto('https://tradingview.com');

    // 等待页面加载完毕
    await wait(page, 2000)

    // 导入币种列表
    const coinsData = fs.readFileSync(path.join(__dirname, 'coins.json'), 'utf8');
    const symbols = JSON.parse(coinsData);

    // 开始测试币种（从第45个开始，即索引44）
    // await testSymbols(page, context, symbols, 44);

    console.log('\n=== 开始添加警报流程 ===');
    await wait(page, 3000);

    // 开始为币种添加警报（从第1个开始，即索引0）
    // await addAlertsForSymbols(page, context, symbols, '小币种防爆v5.1', 15);


    // 示例：删除指定策略的所有警报
    await deleteAlertsByStrategy(page, context, '小币种防爆v5.4');

    await wait(page, 5000)


    // 关闭浏览器
    // await browser.close();
}

// 调用函数
initPage();

