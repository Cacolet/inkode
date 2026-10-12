import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
});
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:1420');
    const editor = page.getByRole('textbox', { name: '文档编辑器' });
    const trigger = page.getByRole('button', { name: '快捷键', exact: true });
    await editor.waitFor();
    await editor.hover();
    await trigger.hover();
    await page.screenshot({ path: 'tests/shortcuts-desktop.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '源码', exact: true }).click();
    await editor.fill('hello');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+b');
    assert.equal(await editor.innerText(), '**hello**');
    await page.keyboard.press('ControlOrMeta+b');
    assert.equal(await editor.innerText(), 'hello');
    await trigger.hover();
    const panel = page.getByRole('region', { name: '快捷键列表' });
    await panel.waitFor();
    await panel.getByRole('button', { name: '加粗', exact: true }).click();
    assert.equal(await editor.innerText(), '**hello**', 'panel preserves the editor selection');
    await panel.getByRole('button', { name: '加粗', exact: true }).click();
    assert.equal(await editor.innerText(), 'hello');
    await panel.getByRole('button', { name: '2 级标题', exact: true }).scrollIntoViewIfNeeded();
    await panel.getByRole('button', { name: '2 级标题', exact: true }).click();
    assert.equal(await editor.innerText(), '## hello');
    await page.getByRole('button', { name: '变更审阅', exact: true }).hover();
    await panel.waitFor({ state: 'hidden' });
    await trigger.hover();
    await panel.getByRole('button', { name: '斜体', exact: true }).click();
    assert.equal(await editor.innerText(), '## hello', 'no document target is a silent no-op');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+/');
    assert.equal(await page.getByRole('button', { name: '即时预览', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await editor.innerText(), '## hello', 'source shortcut does not insert comment syntax');
    await trigger.hover();
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+n');
    await page.getByRole('textbox', { name: '文件名' }).fill('example.ts');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await editor.fill('const answer = 42;');
    await trigger.hover();
    assert.equal(await panel.getByRole('button', { name: '加粗', exact: true }).count(), 0, 'code docs only show applicable actions');
    await page.keyboard.press('Escape');
    await editor.hover();
    await trigger.hover();
    await panel.getByRole('button', { name: '查找与替换', exact: true }).click();
    const search = page.locator('.cm-search input[name="search"]');
    assert.equal(await search.evaluate((node) => node === document.activeElement), true, 'panel search retains search field focus');
    await search.fill('query');
    await search.press('ControlOrMeta+b');
    assert.equal(await search.inputValue(), 'query');
    assert.equal(await editor.innerText(), 'const answer = 42;', 'shortcuts do not edit a document from another input');
    await page.locator('.cm-search button[name="close"]').click();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+w');
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    for (const width of [1600, 1280, 1024, 850, 768, 560, 440]) {
        await page.setViewportSize({ width, height: 820 });
        await editor.hover();
        await trigger.hover();
        await panel.waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
        const box = await panel.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 820, `panel contained at ${width}`);
        if (width === 440) { await page.screenshot({ path: 'tests/shortcuts-compact.png' }); }
    }
    assert.equal(await page.locator('.sidebar-note, .sidebar-bottom, .directory-hint').count(), 0, 'decorative small print removed');
    assert.deepEqual(errors, []);
    console.log('Shortcut UI passed: keyboard toggle, hover list, click/selection, no-target no-op, source mode, new/close, code context, search-input isolation, Escape, responsive panel.');
} finally { await browser.close(); }
