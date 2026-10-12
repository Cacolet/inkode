type TSemantic = 'name' | 'message' | 'action' | 'state';
// Local Chinese catalog boundary; additional locales can be added without changing components.
export const i18n = {
    t(_semantic: TSemantic, text: string): string { return text; },
};
