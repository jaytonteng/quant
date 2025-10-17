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
const autoFollow = async(page, context) => {
  
  await page.waitForSelector('.feeds-container', { state: 'visible' });
  const noteItems = await page.$$('.note-item');
    // 循环点击每个 note-item
    let index = 1 
    for (let noteItem of noteItems) {
      console.log(`第${index}个帖子`)
      await noteItem.click();

      // 获取所有的 avatar divs 内的 a 标签
      const avatarLinks = await page.$$('div.avatar a');

      // 循环点击每个 a 标签
      let avatarIndex = 1
      for (let link of avatarLinks.slice(0,1)) {
        console.log(`第${avatarIndex}个用户`)
        // await link.click();
        const [newPage] = await Promise.all([
          context.waitForEvent('page'), // 等待新标签页
          link.click() // 点击链接，这应该会打开一个新的标签页
        ]);

        // 等待新页面的元素加载完成
        await newPage.waitForSelector('.follow-button');
        await wait(page, 1000, '新页面加载完成')
        // 点击新页面中的 follow-butto   n
        await newPage.click('.follow-button');
        await wait(page, 1000, '点击 follow-button 完成')

        await newPage.waitForSelector('span:has-text("已关注")');

        // 关闭新页面
        await newPage.close();
        avatarIndex++
      }
      await page.click('.close-circle');
      index++
    }
}
const initPage = async () => {
    const browser = await chromium.connectOverCDP({
      endpointURL: 'http://localhost:9999'
  });

  // 获取当前所有的上下文
  const contexts = browser.contexts();
  const context = contexts[0]; // 取第一个上下文，通常是默认上下文

    // 打开新页面
    // const page = await browser.newPage();
    const page = await context.newPage();
    const stealthScript = fs.readFileSync(path.join(__dirname, 'stealth.min.js'), 'utf8');
    await page.addInitScript(stealthScript); // 注入 stealth.min.js

    await hideTrack(page)

    // 导航到小红书登录页面
    await page.goto('https://www.xiaohongshu.com');

    // 等待页面加载完毕

    await page.fill('#search-input', 'ai学口语'); // 将 '#username' 替换为正确的选择器
    await wait(page, 500)
    await page.click('.search-icon');
    // await wait(page, 2000)

    await autoFollow(page, context)

    await wait(page, 20500)

    // 关闭浏览器
    // await browser.close();
}

// 调用函数
initPage();





async function automateWithPuppeteer() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://www.xiaohongshu.com');
  console.log('Visited with Puppeteer:', await page.title());

  // 模拟用户行为，如果有需要
  await page.mouse.move(150, 150);
  await page.mouse.click(150, 150);

  setTimeout(async () => {
    await page.click('[placeholder="输入手机号"]');

    // 填充手机号
    await page.type('[placeholder="输入手机号"]', '130 6777 9857');
    
    // 点击获取验证码
    const getTextButton = await page.$x("//button[contains(text(), '获取验证码')]");
    if (getTextButton.length > 0) {
        await getTextButton[0].click();
    }
  
    // 点击验证码滑块
    await page.click('.red-captcha-slider');
  
    await browser.close();
  }, 3000);


}

// automateWithPuppeteer()