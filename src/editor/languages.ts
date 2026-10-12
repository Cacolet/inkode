import type { Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';

export async function languageFor(name: string): Promise<Extension> {
    const extension = name.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'md': case 'markdown': return markdown({ codeLanguages: [] });
        case 'ts': case 'tsx': return javascript({ typescript: true, jsx: extension === 'tsx' });
        case 'js': case 'jsx': return javascript({ jsx: extension === 'jsx' });
        case 'json': return (await import('@codemirror/lang-json')).json();
        case 'css': return (await import('@codemirror/lang-css')).css();
        case 'html': return (await import('@codemirror/lang-html')).html();
        case 'rs': return (await import('@codemirror/lang-rust')).rust();
        case 'py': return (await import('@codemirror/lang-python')).python();
        case 'yaml': case 'yml': return (await import('@codemirror/lang-yaml')).yaml();
        case 'sql': return (await import('@codemirror/lang-sql')).sql();
        default: return [];
    }
}
