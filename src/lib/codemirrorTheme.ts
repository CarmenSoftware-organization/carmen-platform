import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * Theme-aware CodeMirror styling for every editor in the app.
 *
 * CodeMirror's `defaultHighlightStyle` is a light-ground palette with no dark counterpart — its
 * keyword colour is `#708`, a dark purple, which on the `30 6% 9%` dark ground sits at roughly
 * 1.6:1 and is effectively unreadable. Both editors shipped with it, so `SELECT` and `<tag>`
 * disappeared the moment anyone switched the theme.
 *
 * Every colour here is `hsl(var(--token))`, so one style serves both themes and follows a live
 * theme switch without the editor being torn down and rebuilt. That rules out CodeMirror's own
 * `themeType` / `{ dark: true }` mechanism, which bakes the choice in at extension-creation time.
 *
 * The palette is deliberately four hues, not eight — keyword, string, literal, comment — because
 * a page whose whole design is a warm neutral ground and one accent should not grow a rainbow
 * inside its editor, and four is enough to read SQL by.
 *
 * They are their OWN tokens (`--code-*` in `index.css`), not the status tokens they resemble.
 * `--success` / `--warning` are chip BACKGROUNDS carrying white text; borrowing `--warning` for a
 * numeric literal measured 3.08:1 against the light ground. Every `--code-*` value is held at or
 * above 4.5:1 against `--background` in its own theme.
 */
export const carmenHighlightStyle = HighlightStyle.define([
  // Keywords carry the shape of the statement — the accent, and the only weight in the palette.
  {
    tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword],
    color: 'hsl(var(--code-keyword))',
    fontWeight: '600',
  },
  // Type and built-in names: the accent again, unweighted, so they group with keywords without
  // competing with them.
  {
    tag: [t.typeName, t.standard(t.name), t.namespace, t.className, t.self],
    color: 'hsl(var(--code-keyword))',
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.character], color: 'hsl(var(--code-string))' },
  {
    tag: [t.number, t.bool, t.null, t.atom, t.literal, t.integer, t.float],
    color: 'hsl(var(--code-literal))',
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: 'hsl(var(--code-comment))',
    fontStyle: 'italic',
  },
  {
    tag: [t.operator, t.punctuation, t.separator, t.bracket, t.paren, t.squareBracket, t.brace],
    color: 'hsl(var(--code-comment))',
  },
  // Identifiers — table and column names in SQL — are the body text of the document, not a
  // highlight. They read as plain foreground on purpose.
  { tag: [t.variableName, t.propertyName, t.name, t.labelName], color: 'hsl(var(--foreground))' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'hsl(var(--foreground))' },
  { tag: t.invalid, color: 'hsl(var(--destructive))' },

  // XML / markup. The angle brackets are punctuation, the tag name is the accent, and an
  // attribute value is a string like any other.
  { tag: [t.tagName, t.processingInstruction], color: 'hsl(var(--code-keyword))', fontWeight: '600' },
  { tag: t.attributeName, color: 'hsl(var(--foreground))' },
  { tag: t.attributeValue, color: 'hsl(var(--code-string))' },
  { tag: [t.angleBracket, t.definition(t.tagName)], color: 'hsl(var(--code-comment))' },
  { tag: [t.meta, t.documentMeta], color: 'hsl(var(--code-comment))' },
  { tag: t.content, color: 'hsl(var(--foreground))' },

  { tag: t.link, color: 'hsl(var(--code-keyword))', textDecoration: 'underline' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.heading, color: 'hsl(var(--foreground))', fontWeight: '700' },
]);

/**
 * The editor's chrome — caret, selection, active line, gutters, and the panels CodeMirror opens
 * on top of the document. These have the same problem as the palette: CodeMirror's base theme
 * paints a black caret and a lavender selection, both aimed at a white page.
 *
 * Selectors mirror the specificity of the base theme's own `&light` / `&dark` rules; a plain
 * `.cm-selectionBackground` loses to them and the override silently does nothing.
 */
export function carmenEditorTheme(fontSize: string) {
  return EditorView.theme({
    '&': { fontSize, color: 'hsl(var(--foreground))', backgroundColor: 'transparent' },
    '.cm-content': { caretColor: 'hsl(var(--foreground))' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-focused': { outline: 'none' },

    '&.cm-focused .cm-cursor, .cm-cursor': { borderLeftColor: 'hsl(var(--foreground))' },
    // The long descendant form is not redundant: CodeMirror's own light base theme ships
    // `&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground` at four
    // classes of specificity, which a plain `.cm-selectionBackground` loses to outright.
    [[
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground',
      '&.cm-focused .cm-selectionBackground',
      '.cm-selectionBackground',
      '.cm-content ::selection',
    ].join(', ')]: {
      backgroundColor: 'hsl(var(--primary) / 0.25)',
    },
    '.cm-activeLine': { backgroundColor: 'hsl(var(--muted-foreground) / 0.08)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'hsl(var(--muted-foreground) / 0.08)',
      color: 'hsl(var(--foreground))',
    },
    '.cm-selectionMatch': { backgroundColor: 'hsl(var(--warning) / 0.22)' },
    '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': {
      backgroundColor: 'hsl(var(--primary) / 0.22)',
      outline: 'none',
      color: 'inherit',
    },
    '&.cm-focused .cm-nonmatchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'hsl(var(--destructive) / 0.25)',
      color: 'inherit',
    },

    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'hsl(var(--muted-foreground))',
      borderRight: '1px solid hsl(var(--border))',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'hsl(var(--muted))',
      color: 'hsl(var(--muted-foreground))',
      border: '1px solid hsl(var(--border))',
    },

    // Panels and tooltips are rendered outside the content flow and keep CodeMirror's own white
    // surfaces unless they are named explicitly.
    '.cm-panels': {
      backgroundColor: 'hsl(var(--card))',
      color: 'hsl(var(--foreground))',
      borderColor: 'hsl(var(--border))',
    },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid hsl(var(--border))' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid hsl(var(--border))' },
    '.cm-panel input, .cm-textfield, .cm-panel select': {
      backgroundColor: 'hsl(var(--background))',
      color: 'hsl(var(--foreground))',
      border: '1px solid hsl(var(--input))',
      borderRadius: '4px',
      padding: '2px 6px',
    },
    // `backgroundImage: none` is the whole point: CodeMirror paints its buttons with a
    // light-grey linear-gradient, which sits on top of any background-color and left the
    // search panel's Next / Previous / Replace as blank white slabs with white labels.
    '.cm-panel button, .cm-button': {
      backgroundImage: 'none',
      backgroundColor: 'hsl(var(--secondary))',
      color: 'hsl(var(--secondary-foreground))',
      border: '1px solid hsl(var(--border))',
      borderRadius: '4px',
      padding: '2px 8px',
    },
    '.cm-panel button:hover, .cm-button:hover': {
      backgroundColor: 'hsl(var(--accent))',
      color: 'hsl(var(--accent-foreground))',
    },
    '.cm-panel label, .cm-panel.cm-search label': { color: 'hsl(var(--muted-foreground))' },
    '.cm-panel.cm-search [name=close]': { color: 'hsl(var(--muted-foreground))' },
    '.cm-searchMatch': { backgroundColor: 'hsl(var(--warning) / 0.3)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'hsl(var(--warning) / 0.55)' },

    '.cm-tooltip': {
      backgroundColor: 'hsl(var(--popover))',
      color: 'hsl(var(--popover-foreground))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 'var(--radius)',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { color: 'hsl(var(--popover-foreground))' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'hsl(var(--accent))',
      color: 'hsl(var(--accent-foreground))',
    },
    '.cm-completionLabel': { color: 'inherit' },
    '.cm-completionDetail': { color: 'hsl(var(--muted-foreground))' },
  });
}
