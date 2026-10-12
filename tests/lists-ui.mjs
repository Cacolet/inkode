import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:1420');
    const editor = page.getByRole('textbox', { name: '文档编辑器' });
    await editor.waitFor();
    await page.getByRole('button', { name: '源码', exact: true }).click();
    const source = '# Lists\n\n- ordinary\n  - nested\n* star\n+ plus\n\n- [ ] pending\n- [x] done\n  - [X] nested task\n\n[ ] shorthand\n[x] shorthand done\n\n1. ordered\n2. [ ] ordered task\n\n```md\n- [ ] fenced\n[ ] literal\n```\n\n`[ ] inline`\n\nEnd';
    await editor.fill(source);
    await page.keyboard.press('ControlOrMeta+Home');
    await page.getByRole('button', { name: '即时预览', exact: true }).click();
    const tasks = page.locator('.md-task');
    assert.equal(await tasks.count(), 6, 'standard, nested, ordered, and shorthand task items');
    assert.equal(await page.locator('.md-list-bullet').count(), 4, 'all unordered list markers become bullets');
    for (const task of await tasks.all()) {
        const text = await task.evaluate((node) => node.closest('.cm-line').textContent.trim());
        assert.ok(!/^[-*+]|^\d+\./.test(text), `task has no extra list marker: ${text}`);
    }
    assert.equal(await tasks.nth(1).isChecked(), true);
    assert.equal(await tasks.nth(2).isChecked(), true);
    await tasks.first().check();
    await tasks.nth(3).check();
    await page.screenshot({ path: 'tests/lists.png' });
    await page.getByRole('button', { name: '源码', exact: true }).click();
    const restored = await editor.locator('.cm-line').allTextContents();
    assert.equal(restored.join('\n'), source.replace('- [ ] pending', '- [x] pending').replace('[ ] shorthand', '[x] shorthand'), 'only toggled checkbox values change in source');
    await editor.fill('-');
    await page.getByRole('button', { name: '即时预览', exact: true }).click();
    assert.equal(await page.locator('.md-list-bullet').count(), 0, 'bare dash remains literal');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' ');
    assert.equal(await page.locator('.md-list-bullet').count(), 1, 'dash plus space becomes a bullet');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('.md-list-bullet').count(), 0, 'deleting the space restores the dash');
    assert.equal(await editor.locator('.cm-line').first().textContent(), '-');
    await page.keyboard.type('text');
    assert.equal(await page.locator('.md-list-bullet').count(), 0, 'dash without separator is plain text');
    assert.deepEqual(errors, []);
    console.log('List previews passed: bullets, task markers, nesting, ordered tasks, shorthand, toggles, fenced/inline code, source integrity.');
} finally { await browser.close(); }
