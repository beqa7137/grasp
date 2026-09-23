import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
  type OnDestroy,
} from '@angular/core';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import type { Language } from '@grasp/engine';
import { tags } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword], color: '#c792ea' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#82aaff' },
  { tag: [tags.string, tags.special(tags.string)], color: '#c3e88d' },
  { tag: [tags.number, tags.bool, tags.null], color: '#f78c6c' },
  { tag: tags.comment, color: '#5b6377', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className], color: '#ffcb6b' },
  { tag: tags.operator, color: '#89ddff' },
]);

const theme = EditorView.theme(
  {
    '&': { color: 'var(--g-text)', backgroundColor: 'var(--g-surface)', height: '100%', fontSize: '14px' },
    '.cm-content': { fontFamily: 'var(--g-font-mono)', caretColor: 'var(--g-accent)', padding: '10px 0' },
    '.cm-scroller': { fontFamily: 'var(--g-font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'var(--g-surface)', color: 'var(--g-faint)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'rgba(157, 140, 255, 0.07)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--g-accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(157, 140, 255, 0.28)' },
    '.cm-error-line': { backgroundColor: 'rgba(255, 93, 115, 0.14)' },
    '.cm-trace-line': { backgroundColor: 'rgba(76, 201, 240, 0.16)' },
    '.cm-tooltip': { backgroundColor: 'var(--g-raised)', border: '1px solid var(--g-line-strong)' },
  },
  { dark: true },
);

const setMarks = StateEffect.define<{ error: number | null; trace: number | null }>();
const marks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const ranges = [];
      for (const [line, cls] of [
        [e.value.trace, 'cm-trace-line'],
        [e.value.error, 'cm-error-line'],
      ] as const) {
        if (line && line <= tr.state.doc.lines) ranges.push(Decoration.line({ class: cls }).range(tr.state.doc.line(line).from));
      }
      return Decoration.set(ranges.sort((a, b) => a.from - b.from));
    }
    return value.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const languageExtension = (language: Language): Extension =>
  language === 'python' ? python() : javascript({ typescript: language === 'typescript' });

@Component({
  selector: 'app-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="host"></div>`,
  styles: `
    :host {
      display: block;
      min-height: 0;
    }
    .host {
      height: 100%;
    }
  `,
})
export class CodeEditorComponent implements OnDestroy {
  readonly value = input.required<string>();
  readonly language = input.required<Language>();
  readonly errorLine = input<number | null>(null);
  readonly traceLine = input<number | null>(null);
  readonly label = input('Code editor');
  readonly valueChange = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly languageSlot = new Compartment();
  private view: EditorView | null = null;

  /** Set once the editor exists; the effects below re-run when it appears. */
  private readonly ready = signal(false);

  constructor() {
    // The editor measures itself and mounts its styles into the host's root, so wait until the host is attached.
    afterNextRender(() => this.createWhenAttached());

    effect(() => {
      const value = this.value();
      if (!this.ready()) return;
      const view = this.view;
      if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    });

    effect(() => {
      const language = this.language();
      if (!this.ready()) return;
      this.view?.dispatch({ effects: this.languageSlot.reconfigure(languageExtension(language)) });
    });

    effect(() => {
      const error = this.errorLine();
      const trace = this.traceLine();
      if (!this.ready()) return;
      const view = this.view;
      if (!view) return;
      view.dispatch({ effects: setMarks.of({ error, trace }) });
      const line = trace ?? error;
      if (line && line <= view.state.doc.lines) this.revealLine(view, line);
    });
  }

  private createWhenAttached() {
    const host = this.host().nativeElement;
    if (!host.isConnected) {
      requestAnimationFrame(() => this.createWhenAttached());
      return;
    }
    this.view = new EditorView({
      parent: host,
      // CodeMirror follows slots when looking for its root, which would put its styles inside
      // ion-content's shadow root where they do not reach this light-DOM editor.
      root: host.getRootNode() as Document | ShadowRoot,
      state: EditorState.create({
        doc: untracked(this.value),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          keymap.of([indentWithTab, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap]),
          syntaxHighlighting(highlight),
          theme,
          marks,
          this.languageSlot.of(languageExtension(untracked(this.language))),
          EditorView.contentAttributes.of({ 'aria-label': untracked(this.label) }),
          EditorView.updateListener.of((update) => update.docChanged && this.valueChange.emit(update.state.doc.toString())),
        ],
      }),
    });
    this.ready.set(true);
  }

  /** Scrolls only the editor, never the page around it, so the highlighted line stays visible. */
  private revealLine(view: EditorView, line: number) {
    view.requestMeasure({
      read: () => view.lineBlockAt(view.state.doc.line(line).from),
      write: (block) => {
        const { scrollTop, clientHeight } = view.scrollDOM;
        if (block.top < scrollTop || block.bottom > scrollTop + clientHeight)
          view.scrollDOM.scrollTop = Math.max(0, block.top - clientHeight / 3);
      },
    });
  }

  focus() {
    this.view?.focus();
  }

  ngOnDestroy() {
    this.view?.destroy();
  }
}
