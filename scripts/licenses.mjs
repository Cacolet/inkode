import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const store = 'node_modules/.pnpm';
const packages = new Map();
for (const item of await readdir(store)) {
    if (item === 'node_modules') continue;
    const directory = join(store, item, 'node_modules');
    let entries;
    try { entries = await readdir(directory); } catch { continue; }
    for (const entry of entries) {
        const candidates = entry.startsWith('@')
            ? (await readdir(join(directory, entry))).map((name) => join(directory, entry, name))
            : [join(directory, entry)];
        for (const candidate of candidates) {
            try {
                const metadata = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
                const key = `${metadata.name}@${metadata.version}`;
                if (packages.has(key)) continue;
                const names = (await readdir(candidate)).filter((name) => /^(license|licence|copying|notice)([._-]|$)/i.test(name));
                const notices = [];
                for (const name of names) {
                    try { notices.push(await readFile(join(candidate, name), 'utf8')); } catch {}
                }
                packages.set(key, `\n${'='.repeat(72)}\n${key}\nLicense: ${metadata.license ?? 'see upstream package'}\n\n${notices.join('\n\n')}`);
            } catch { /* A dependency link can point to a platform package not installed here. */ }
        }
    }
}
// Include native dependencies as well as JavaScript packages in distributed notices.
const host = /^host: (.+)$/m.exec(execFileSync('rustc', ['-vV'], { encoding: 'utf8' }))[1];
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path',
    'src-tauri/Cargo.toml', '--locked', '--offline', '--format-version', '1',
    '--filter-platform', host], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
for (const dependency of metadata.packages.filter((item) => item.source !== null)) {
    const directory = join(dependency.manifest_path, '..');
    const names = (await readdir(directory)).filter((name) =>
        /^(license|licence|copying|notice)([._-]|$)/i.test(name));
    if (dependency.license_file && !names.includes(dependency.license_file)) {
        names.push(dependency.license_file);
    }
    const notices = [];
    for (const name of names) {
        try { notices.push(await readFile(join(directory, name), 'utf8')); } catch {}
    }
    const key = `crate:${dependency.name}@${dependency.version}`;
    packages.set(key, `\n${'='.repeat(72)}\n${key}\nLicense: ${dependency.license ?? 'see upstream crate'}\nSource: https://crates.io/crates/${dependency.name}/${dependency.version}\n\n${notices.join('\n\n')}`);
}
const text = 'Inkode — third-party notices\nIncludes installed JavaScript and Rust build/runtime dependencies.\n'
    + [...packages.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, notice]) => notice).join('\n');
await writeFile('THIRD_PARTY_NOTICES.txt', text);
console.log(`Collected notices for ${packages.size} installed packages.`);
