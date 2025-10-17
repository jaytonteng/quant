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
const searchCoin = async(page, context, strategyName, symbol) => {
  try {
    // 检查搜索框是否已经打开（尝试多种选择器）
    let existingSearchInput = await page.$('.input-KLRTYDjH');
    if (!existingSearchInput) {
      existingSearchInput = await page.$('.search-ZXzPWcCf');
    }
    if (!existingSearchInput) {
      existingSearchInput = await page.$('input[placeholder="Search"]');
    }
    
    if (!existingSearchInput) {
      console.log('搜索框未打开，点击搜索按钮...');
      // 点击搜索按钮打开搜索框
  const searchBtn = await page.$$('.tv-header-search-container__button')
      if (searchBtn.length > 0) {
  searchBtn[0].click()
      } else {
        // 如果找不到搜索按钮，使用键盘快捷键
        await page.keyboard.press('Control+k');
      }
      await wait(page, 1000);
    } else {
      console.log('搜索框已打开，直接使用');
    }

    // 等待搜索框出现并清空输入（尝试多个可能的搜索框选择器）
    let searchInput = null;
    try {
      // 首先尝试原来的搜索框
      searchInput = await page.waitForSelector('.input-KLRTYDjH', { state: 'visible', timeout: 1000 });
      console.log('找到搜索框: .input-KLRTYDjH');
    } catch (error) {
      try {
        // 如果找不到，尝试新的搜索框
        searchInput = await page.waitForSelector('.search-ZXzPWcCf', { state: 'visible', timeout: 5000 });
        console.log('找到搜索框: .search-ZXzPWcCf');
      } catch (error2) {
        console.log('找不到搜索框，尝试通用选择器...');
        // 尝试通用的搜索框选择器
        searchInput = await page.waitForSelector('input[placeholder="Search"]', { state: 'visible', timeout: 5000 });
        console.log('找到搜索框: input[placeholder="Search"]');
      }
    }

    // 清空并输入搜索内容
    if (searchInput) {
      await searchInput.fill('');
      await wait(page, 500);
      await searchInput.fill(symbol);
      await wait(page, 1000);
    } else {
      throw new Error('无法找到搜索框');
    }

    await page.waitForSelector('.listContainer-dlewR1s1', { state: 'visible' });
    await wait(page, 1000)

    // 等待搜索结果真正加载完成
    console.log('等待搜索结果加载...');
    
    // 循环检查搜索结果，最多等待10秒
    let item = [];
    let attempts = 0;
    const maxAttempts = 100; // 20次 * 500ms = 10秒
    
    while (item.length === 0 && attempts < maxAttempts) {
      await wait(page, 500);
      item = await page.$$('.itemRow-oRSs8UQo');
      attempts++;
      console.log(`第 ${attempts} 次检查，找到 ${item.length} 个搜索结果`);
    }
    
    if (item.length > 0) {
      // 遍历所有 itemRow，找到 symbolTitle-oRSs8UQo > em 的内容等于 symbol 且交易所为 OKX 的那一项
      let found = false;
      for (let i = 0; i < item.length; i++) {
        const symbolTitle = await item[i].$('.symbolTitle-oRSs8UQo');
        if (symbolTitle) {
          try {
            const emText = await symbolTitle.$eval('em', el => el.textContent);
            if (emText && emText.toUpperCase() === symbol.toUpperCase()) {
              // 检查交易所是否为 OKX
              const exchangeElement = await item[i].$('.exchangeName-oRSs8UQo');
              if (exchangeElement) {
                const exchangeName = await exchangeElement.textContent();
                if (exchangeName && exchangeName.trim().toUpperCase() === 'OKX') {
                  await item[i].click();
                  found = true;
                  console.log(`点击了匹配的 symbol: ${emText} (OKX)`);
                  break;
                } else {
                  console.log(`找到 ${emText}，但交易所为 ${exchangeName}，跳过`);
                }
              } else {
                console.log(`找到 ${emText}，但未找到交易所信息，跳过`);
              }
            }
          } catch (e) {
            // 跳过没有 em 的
          }
        }
      }
      if (!found) {
        console.log(`没有找到匹配的 symbol (OKX): ${symbol}，跳过此步骤`);
        return;
      }
    } else {
      console.log(`等待 ${maxAttempts * 0.5} 秒后仍未找到搜索结果，跳过此步骤`);
      return
    }
    await wait(page, 1000)

    await page.waitForSelector('.sources-l31H9iuA', { state: 'visible' });

    const strategy = await page.$$('.titlesWrapper-l31H9iuA');
    
    // 查找包含特定文字的策略和对应的索引
    let targetStrategy = null;
    let targetIndex = -1;
    for (let i = 0; i < strategy.length; i++) {
      const text = await strategy[i].textContent();
      if (text && text.includes(strategyName)) {
        targetStrategy = strategy[i];
        targetIndex = i;
        break;
      }
    }

    if (targetStrategy) {
      await targetStrategy.click();
    } else {
      console.log(`没有找到包含"${strategyName}"的策略`);
      return;
    }

    // const strategyWrapper = await page.$$('.item-l31H9iuA.study-l31H9iuA');
    // console.log(strategyWrapper.length, 'strategywrapper')
    
    // const lastStrategyWrapper = strategyWrapper[strategyWrapper.length - 1];

    // // 在目标 strategyWrapper 内查找设置按钮
    // const buttons = await lastStrategyWrapper.$$('button.button-l31H9iuA.apply-common-tooltip.accessible-l31H9iuA[data-name="legend-settings-action"]');

    // console.log(buttons.length, 'buttons')
    // if (buttons.length > 0) {
    //   await buttons[0].click()
    // } else {
    //   console.log('没有找到设置按钮')
    //   return
    // }

    // await wait(page, 1000)
    
    // // 等待并点击 Properties 按钮
    // await page.waitForSelector('button#properties[data-id="indicator-properties-dialog-tabs-properties"]', { state: 'visible' });
    // await page.click('button#properties[data-id="indicator-properties-dialog-tabs-properties"]');
    
    // await wait(page, 1000)
    
    // 等待并点击 Create Alert 按钮
    await page.waitForSelector('button#header-toolbar-alerts[aria-label="Create Alert"]', { state: 'visible' });
    await page.click('button#header-toolbar-alerts[aria-label="Create Alert"]');
    
    await wait(page, 1000)
    
    // 等待并点击 Message 按钮
    await page.waitForSelector('button#alert-dialog-tabs__message[data-id="alert-dialog-tabs__message"]', { state: 'visible' });
    await page.click('button#alert-dialog-tabs__message[data-id="alert-dialog-tabs__message"]');
    
    await wait(page, 1000)
    
    // 等待 textarea 出现并输入内容
    await page.waitForSelector('textarea#alert-message', { state: 'visible' });
    await page.fill('textarea#alert-message', `{
    "id": "{{strategy.order.id}}",
    "action": "{{strategy.order.action}}",
    "marketPosition": "{{strategy.market_position}}",
    "prevMarketPosition": "{{strategy.prev_market_position}}",
    "marketPositionSize": "{{strategy.market_position_size}}",
    "prevMarketPositionSize": "{{strategy.prev_market_position_size}}",
    "instrument": "{{ticker}}",
    "signalToken": "O1y9cUqEkZmXNUaQGjiR1dsnjMzlrij1Y+H8o8OcOTPuvgBkJpZNttKomuN1ins7o9LEm2Ai2eSddaEn9JMiDA==",
    "timestamp": "{{timenow}}",
    "maxLag": "300",
    "investmentType": "base",
    "amount": "{{strategy.order.contracts}}"
}`);
    
    await wait(page, 1000)
    
    // 等待输入框出现并输入自定义名称（兼容新旧 data-qa-id）
    let alertNameSelector = null;
    const alertNameCandidates = [
      'input#alert-name[data-qa-id="ui-lib-Input-input alert-name-input"]',
      'input#alert-name[data-qa-id="ui-lib-Input-input alert-name"]',
      'input#alert-name'
    ];
    for (const sel of alertNameCandidates) {
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout: 2000 });
        alertNameSelector = sel;
        break;
      } catch (e) {}
    }
    if (!alertNameSelector) {
      throw new Error('未找到警报名称输入框 (alert-name)');
    }
    await page.fill(alertNameSelector, `${symbol} - ${strategyName}`);
    
    // 直接点击 Create 按钮（兼容新旧选择器）
    await wait(page, 1000)
    let createButtonSelector = null;
    const createButtonCandidates = [
      'button[type="submit"][data-qa-id="submit"]',
      'button[data-qa-id="submit"]',
      'button[data-name="submit"][data-overflow-tooltip-text="Create"]',
      'button[data-overflow-tooltip-text="Create"]'
    ];
    for (const sel of createButtonCandidates) {
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout: 2000 });
        createButtonSelector = sel;
        break;
      } catch (e) {}
    }
    if (!createButtonSelector) {
      throw new Error('未找到 Create 按钮');
    }
    await page.click(createButtonSelector);
    
    await wait(page, 2000)

    // 等待警报创建完成，然后重新搜索新币种
    console.log(`警报创建完成，准备搜索下一个币种...`);
    
    // 等待页面稳定
    await wait(page, 1000);

  } catch (error) {
    console.log(`为 ${symbol} 添加警报时发生错误: ${error.message}`);
    throw error;
  }

}

const testSymbol = async(page, context, symbol) => {
  try {
    // 检查页面是否还在TradingView，如果不在则重新导航
    const currentUrl = page.url();
    if (!currentUrl.includes('tradingview.com')) {
      console.log('页面不在TradingView，重新导航...');
      await page.goto('https://tradingview.com');
      await wait(page, 3000);
    }

    // 检查搜索框是否已经打开，如果打开了就关闭它
    const searchContainer = await page.$('.listContainer-dlewR1s1');
    if (searchContainer) {
      console.log('搜索框已打开，按ESC关闭...');
      await page.keyboard.press('Escape');
      await wait(page, 1000);
    }

    // 点击搜索按钮
    const searchBtn = await page.$$('.tv-header-search-container__button')
    if (searchBtn.length === 0) {
      console.log('找不到搜索按钮，使用键盘快捷键');
      await page.keyboard.press('Control+k');
    } else {
      await searchBtn[0].click();
    }

    await wait(page, 1000)

    // 清空并输入搜索内容
    await page.fill('.input-KLRTYDjH', '');
    await wait(page, 500);
    await page.fill('.input-KLRTYDjH', symbol);
    await wait(page, 1000)

    // 等待搜索结果，设置较短的超时时间
    try {
      await page.waitForSelector('.listContainer-dlewR1s1', { state: 'visible', timeout: 10000 });
      await wait(page, 500)
    } catch (error) {
      console.log(`等待搜索结果超时: ${error.message}`);
      return false;
    }

    const item = await page.$$('.itemRow-oRSs8UQo');

    if (item.length > 0) {
      // 检查第一个搜索结果中的符号名称
      const symbolTitle = await item[0].$('.symbolTitle-oRSs8UQo');
      if (symbolTitle) {
        try {
          // 提取 <em> 标签内的文本
          const emText = await symbolTitle.$eval('em', el => el.textContent);
          
          console.log(`搜索 ${symbol}，找到: ${emText}`);
          
          if (emText === symbol) {
            console.log(`✓ ${symbol} 匹配成功`);
            return true;
          } else {
            console.log(`✗ ${symbol} 匹配失败，期望: ${symbol}，实际: ${emText}`);
            return false;
          }
        } catch (error) {
          console.log(`提取符号文本失败: ${error.message}`);
          return false;
        }
      } else {
        console.log(`✗ ${symbol} 未找到符号标题元素`);
        return false;
      }
    } else {
      console.log(`✗ ${symbol} 没有搜索结果`);
      return false;
    }
  } catch (error) {
    console.log(`测试 ${symbol} 时发生错误: ${error.message}`);
    return false;
  }
}

const testSymbols = async(page, context, symbols, startIndex = 0) => {
  console.log(`开始测试 ${symbols.length} 个币种，从第 ${startIndex + 1} 个开始...`);

  for (let i = startIndex; i < symbols.length; i++) {
    const symbol = symbols[i];
    console.log(`\n--- 测试第 ${i + 1}/${symbols.length} 个币种: ${symbol} ---`);
    
    try {
      const result = await testSymbol(page, context, symbol);
      
      if (result) {
        console.log(`✅ ${symbol} 测试通过`);
      } else {
        console.log(`❌ ${symbol} 测试失败`);
      }
    } catch (error) {
      console.log(`❌ ${symbol} 测试出错: ${error.message}`);
      // 如果出现严重错误，尝试刷新页面
      if (error.message.includes('Timeout') || error.message.includes('Target closed')) {
        console.log('检测到严重错误，尝试刷新页面...');
        try {
          await page.reload();
          await wait(page, 3000);
        } catch (reloadError) {
          console.log(`页面刷新失败: ${reloadError.message}`);
        }
      }
    }
    
    // 在测试下一个币种前稍作等待
    await wait(page, 1500);
  }

  console.log('\n所有币种测试完成！');
}

const addAlertsForSymbols = async(page, context, symbols, strategyName, startIndex = 0) => {
  // 打印开始添加警报的提示信息
  console.log(`开始为 ${symbols.length} 个币种添加警报，从第 ${startIndex + 1} 个开始...`);

  // 遍历币种数组
  for (let i = startIndex; i < symbols.length; i++) {
    // 获取当前遍历到的币种
    const symbol = symbols[i];
    // 打印当前正在处理的币种信息
    console.log(`\n=== 为第 ${i + 1}/${symbols.length} 个币种添加警报: ${symbol} ===`);
    
    try {
      // 如果不是第一个币种，需要先点击 Symbol Search 按钮切换到新币种
      if (i > startIndex) {
        console.log(`点击 Symbol Search 按钮切换到 ${symbol}...`);
        try {
          await page.waitForSelector('button#header-toolbar-symbol-search', { state: 'visible', timeout: 10000 });
          await page.click('button#header-toolbar-symbol-search');
          console.log('Symbol Search 按钮点击成功');
          await wait(page, 2000);
          
          // 确保搜索框正确打开
          console.log('确保搜索框正确打开...');
          try {
            // 等待搜索框出现（尝试多个选择器）
            try {
              await page.waitForSelector('.input-KLRTYDjH', { state: 'visible', timeout: 1000 });
              console.log('搜索框已正确打开 (.input-KLRTYDjH)');
            } catch (error) {
              try {
                await page.waitForSelector('.search-ZXzPWcCf', { state: 'visible', timeout: 1000 });
                console.log('搜索框已正确打开 (.search-ZXzPWcCf)');
              } catch (error2) {
                await page.waitForSelector('input[placeholder="Search"]', { state: 'visible', timeout: 1000 });
                console.log('搜索框已正确打开 (input[placeholder="Search"])');
              }
            }
          } catch (error) {
            console.log('搜索框未自动打开，手动打开...');
            // 如果搜索框没有自动打开，手动点击搜索按钮
            const searchBtn = await page.$$('.tv-header-search-container__button');
            if (searchBtn.length > 0) {
              await searchBtn[0].click();
              await wait(page, 1000);
            } else {
              // 使用键盘快捷键
              await page.keyboard.press('Control+k');
              await wait(page, 1000);
            }
          }
        } catch (error) {
          console.log(`Symbol Search 按钮点击失败: ${error.message}`);
          // 如果点击失败，尝试使用键盘快捷键
          console.log('尝试使用键盘快捷键...');
          await page.keyboard.press('Control+k');
          await wait(page, 1000);
        }
      }

      // 调用 searchCoin 函数为当前币种添加警报
      await searchCoin(page, context, strategyName, symbol);
      // 打印警报添加成功的提示信息
      console.log(`✅ ${symbol} 警报添加成功`);
    } catch (error) {
      // 打印警报添加失败的提示信息
      console.log(`❌ ${symbol} 警报添加失败: ${error.message}`);
      // 如果出现严重错误，尝试刷新页面
      if (error.message.includes('Timeout') || error.message.includes('Target closed')) {
        // 打印检测到严重错误的提示信息
        console.log('检测到严重错误，尝试刷新页面...');
        try {
          // 刷新页面
          await page.reload();
          // 等待页面加载完成
          await wait(page, 3000);
        } catch (reloadError) {
          // 打印页面刷新失败的提示信息
          console.log(`页面刷新失败: ${reloadError.message}`);
        }
      }
    }
    
    // 在添加下一个警报前稍作等待
    // 等待2秒
    await wait(page, 2000);
  }

  // 打印所有警报添加完成的提示信息
  console.log('\n所有警报添加完成！');
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
    await addAlertsForSymbols(page, context, symbols, '小币种防爆v5.4', 84);


    // 示例：删除指定策略的所有警报
    // await deleteAlertsByStrategy(page, context, '小币种防爆v7.1 - gaiban');

    await wait(page, 5000)


    // 关闭浏览器
    // await browser.close();
}

// 调用函数
initPage();

