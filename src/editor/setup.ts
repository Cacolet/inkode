import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Mode, isMarkdown, type TMode } from '../types';
import { shortcutKeymap } from './shortcuts';
import { markdownPresentation } from './markdown';

export interface IEditorConfig {
    id: string; name: string; text: string; readOnly: boolean;
    mode: TMode; onUpdate: (state: EditorState, changed: boolean) => void;
    onSave: () => void; onToggleSource: () => void;
}
export interface IEditorBundle {
    state: EditorState; presentation: Compartment; language: Compartment;
}
export function presentationExtensions(id: string, name: string, mode: TMode): Extension {
    if (isMarkdown(name) && mode === Mode.PREVIEW) {
        return [markdownPresentation(id), EditorView.lineWrapping];
    }
    return [lineNumbers(), highlightActiveLine()];
}
export function createEditor(config: IEditorConfig): IEditorBundle {
    const presentation = new Compartment();
    const language = new Compartment();
    const state = EditorState.create({
        doc: config.text,
        extensions: [
            history(), drawSelection(), bracketMatching(), closeBrackets(),
            autocompletion(), highlightSelectionMatches(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            EditorState.readOnly.of(config.readOnly), EditorView.editable.of(!config.readOnly),
            language.of(isMarkdown(config.name)
                ? markdown({ base: markdownLanguage, codeLanguages: (info) => /^(ts|js|typescript|javascript)$/.test(info)
                    ? javascript({ typescript: true }).language : null }) : []),
            presentation.of(presentationExtensions(config.id, config.name, config.mode)),
            keymap.of([{ key: 'Mod-s', run: () => { config.onSave(); return true; } },
                { key: 'Mod-/', run: () => {
                    if (!isMarkdown(config.name)) { return false; }
                    config.onToggleSource(); return true;
                } },
                ...shortcutKeymap(isMarkdown(config.name)),
                ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap,
                ...historyKeymap, indentWithTab]),
            EditorView.updateListener.of((update) => {
                config.onUpdate(update.state, update.docChanged);
            }),
            EditorView.contentAttributes.of({ 'aria-label': '文档编辑器', spellcheck: 'false' }),
        ],
    });
    return { state, presentation, language };
}
