import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:1420');
await page.getByRole('textbox', { name: '文档编辑器' }).waitFor();
await page.screenshot({ path: 'tests/desktop.png' });
assert.ok(await page.locator('.md-task').count() >= 3, 'GFM task checkboxes');
await page.getByRole('button', { name: '源码', exact: true }).click();
const editor = page.getByRole('textbox', { name: '文档编辑器' });
assert.match(await editor.innerText(), /# 留一点空间/);
await editor.click();
await page.keyboard.press('ControlOrMeta+End');
await page.keyboard.type('\nUI CHECK\n');
await page.getByRole('button', { name: '即时预览', exact: true }).click();
assert.match(await editor.innerText(), /UI CHECK/);
await page.getByRole('button', { name: '变更审阅', exact: true }).click();
await page.getByRole('region', { name: '差异审阅' }).waitFor();
await page.waitForTimeout(700);
await page.getByRole('button', { name: '关闭审阅' }).click();
await page.getByRole('button', { name: '深色模式' }).click();
await page.screenshot({ path: 'tests/dark.png' });
await page.getByRole('button', { name: '浅色模式' }).click();
for (const width of [1600, 1280, 1024, 850, 768, 560, 440]) {
    await page.setViewportSize({ width, height: 820 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `horizontal overflow at ${width}`);
}
await page.waitForTimeout(250);
await page.screenshot({ path: 'tests/compact.png' });
await page.getByRole('button', { name: '显示文件侧栏' }).click();
await page.getByRole('complementary', { name: '文件导航' }).waitFor();
await page.getByRole('button', { name: '关闭文件侧栏', exact: true }).last().click();
await page.setViewportSize({ width: 1280, height: 820 });
await page.getByRole('button', { name: '新建文档', exact: true }).last().click();
await page.getByRole('textbox', { name: '文件名' }).fill('测试.md');
await page.getByRole('button', { name: '创建', exact: true }).click();
await page.getByRole('textbox', { name: '文档编辑器' }).fill('# 中文测试\n\n- [ ] 一个任务\n');
assert.match(await page.getByRole('textbox', { name: '文档编辑器' }).innerText(), /中文测试/);
await page.getByRole('button', { name: '关闭 测试.md', exact: true }).click();
await page.getByRole('dialog').waitFor();
await page.getByRole('button', { name: '继续编辑', exact: true }).click();
assert.equal(errors.length, 0, errors.join('\n'));
console.log(JSON.stringify({ responsiveWidths: [1600,1280,1024,850,768,560,440],
    editor: 'pass', modeSwitch: 'pass', diff: 'pass', theme: 'pass',
    newDocument: 'pass', leaveGuard: 'pass', pageErrors: errors }, null, 2));
await browser.close();
