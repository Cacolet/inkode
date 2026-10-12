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
    await page.addInitScript(() => {
        window.isTauri = true;
        const choices = [
            { id: 'notes', name: '我的笔记', path: '/test/notes' },
            { id: 'code', name: '代码项目', path: '/test/code' },
            { id: 'notes', name: '我的笔记', path: '/test/notes' },
        ];
        const file = { id: 'readme', name: 'README.md', path: '/test/notes/README.md',
            text: '# 工作区文档\n', revision: 'r1', bom: false, lineEnding: 'LF', readOnly: false };
        let callbackId = 0;
        window.__TAURI_INTERNALS__ = {
            metadata: { currentWindow: { label: 'main' } },
            transformCallback: () => ++callbackId,
            unregisterCallback: () => {},
            invoke: async (command, args) => {
                const roots = JSON.parse(localStorage.getItem('test.roots') ?? '[]');
                if (command === 'list_workspaces') { return roots; }
                if (command === 'choose_workspace') {
                    const index = Number(localStorage.getItem('test.choice') ?? 0);
                    const choice = choices[index % choices.length];
                    localStorage.setItem('test.choice', String(index + 1));
                    localStorage.setItem('test.roots', JSON.stringify([...roots.filter((root) => root.id !== choice.id), choice]));
                    return choice;
                }
                if (command === 'remove_workspace') {
                    localStorage.setItem('test.roots', JSON.stringify(roots.filter((root) => root.id !== args.id)));
                    return;
                }
                if (command === 'list_directory') {
                    return args.workspaceId === 'notes' ? [{ name: 'README.md', path: 'README.md', isDirectory: false }] : [];
                }
                if (command === 'open_document' || command === 'read_document') { return file; }
                if (command === 'save_as') {
                    if (localStorage.getItem('test.cancelSave') === 'true') { return null; }
                    return { ...file, id: 'saved', name: args.name, text: args.text, path: `/test/code/${args.name}` };
                }
                if (command === 'load_drafts') { return []; }
                if (command === 'plugin:window|is_always_on_top') { return false; }
                return null;
            },
        };
    });
    await page.goto('http://127.0.0.1:1420');
    await page.getByRole('textbox', { name: '文档编辑器' }).waitFor();
    const temporary = page.getByRole('region', { name: '临时目录', exact: true });
    assert.equal(await temporary.locator('.tree-item').count(), 1);
    for (let index = 0; index < 3; index++) {
        await page.getByRole('button', { name: '添加目录', exact: true }).click();
        await page.waitForFunction((expected) => document.querySelectorAll('.workspace-root').length === expected, Math.min(index + 1, 2));
    }
    assert.equal(await page.locator('.workspace-root').count(), 2, 'duplicate root is not added');
    await page.getByRole('button', { name: 'README.md', exact: true }).click();
    await page.screenshot({ path: 'tests/multi-directory.png' });
    await page.getByRole('button', { name: '移除目录 我的笔记', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.workspace-root').length === 1);
    assert.equal(await page.getByRole('tab', { name: 'README.md', exact: true }).count(), 1, 'removing root keeps open file');
    await page.reload();
    await page.getByRole('region', { name: '目录 代码项目', exact: true }).waitFor();
    assert.equal(await page.locator('.workspace-root').count(), 1, 'root list restored');
    await page.getByRole('button', { name: '新建文档', exact: true }).last().click();
    await page.getByRole('textbox', { name: '文件名' }).fill('临时笔记.md');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    assert.equal(await temporary.getByRole('button', { name: '临时笔记.md', exact: true }).count(), 1);
    await page.getByRole('textbox', { name: '文档编辑器' }).fill('# 保留这段文字\n');
    await page.evaluate(() => localStorage.setItem('test.cancelSave', 'true'));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await temporary.getByRole('button', { name: '临时笔记.md', exact: true }).count(), 1, 'cancelled save remains temporary');
    await page.evaluate(() => localStorage.setItem('test.cancelSave', 'false'));
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.temporary-directory .tree-item')].some((node) => node.textContent === '临时笔记.md'));
    assert.equal(await page.getByRole('tab', { name: '临时笔记.md', exact: true }).count(), 1, 'saved document stays open');
    assert.match(await page.getByRole('textbox', { name: '文档编辑器' }).innerText(), /保留这段文字/);
    await temporary.locator('.tree-item').first().click();
    for (const selector of ['.workspace-button', '.workspace-root-header', '.tree-item.selected', '.tab.active', '.mode-switch', '.save-button']) {
        const radius = await page.locator(selector).first().evaluate((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius));
        assert.ok(radius >= 8, `rounded ${selector}`);
    }
    for (const width of [1600, 1280, 1024, 850, 768, 560, 440]) {
        await page.setViewportSize({ width, height: 820 });
        if (width <= 850) { await page.getByRole('button', { name: '显示文件侧栏' }).click(); }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
        await page.getByRole('button', { name: '移除目录 代码项目', exact: true }).waitFor({ state: 'visible' });
        if (width === 440) { await page.screenshot({ path: 'tests/multi-directory-compact.png' }); }
        if (width <= 850) { await page.getByRole('button', { name: '关闭文件侧栏', exact: true }).last().click(); }
    }
    assert.deepEqual(errors, []);
    console.log('Multi-directory IPC mock integration: add, deduplicate, remove, retain open file, restore roots, temporary save/cancel, rounded UI, responsive widths: passed.');
} finally { await browser.close(); }
