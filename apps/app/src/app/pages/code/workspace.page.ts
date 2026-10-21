import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  type Type,
} from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import {
  LANGUAGES,
  buildSuite,
  clip,
  entryName,
  exampleCases,
  getCodingProblem,
  getPatternSummary,
  inputSize,
  nextUnsolved,
  preview,
  starterCode,
  type Language,
  type LevelOrder,
  type TestCase,
} from '@grasp/engine';
import { IonButtons, IonContent, IonHeader, IonIcon, IonRouterOutlet, IonTitle, IonToolbar, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircle,
  checkmarkCircle,
  closeCircle,
  footstepsOutline,
  playOutline,
  refreshOutline,
  rocketOutline,
  stopwatchOutline,
} from 'ionicons/icons';
import { CodeEditorComponent } from '../../code/code-editor.component';
import { InterviewReportsComponent } from '../../companies/interview-reports.component';
import { LANGUAGE_LABELS, LanguagePickerComponent } from '../../code/language-picker.component';
import type { RunnerError } from '../../code/protocol';
import { RunnerService, type RunReport, type TestReport } from '../../code/runner.service';
import { toFrames, type TraceFrame } from '../../code/trace-frames';
import { TracePlayerComponent } from '../../code/trace-player.component';
import { exampleTree } from '../../code/tree-frames';
import { refocus, refocusAfterRender } from '../../core/focus';
import { haptic } from '../../core/haptics';
import { CODE_DRAFT_PREFIX, CODE_HINTS_PREFIX, HINT_RUNGS } from '../../core/local-drafts';
import { onPageKey } from '../../core/on-page-key';
import { firstIdle } from '../../core/serial-preloading.strategy';
import { ProgressService } from '../../core/progress.service';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { uniqueId } from '../../core/unique-id';
import { CodeTextComponent } from '../../viz/code-text.component';
import { TreeViewComponent } from '../../viz/tree-view.component';
import { BackComponent } from '../../ui/back.component';
import { SegmentedComponent, type SegmentOption } from '../../ui/segmented.component';
import { LibraryPrefsService } from '../coding/library-prefs.service';

const LANGUAGE_KEY = 'grasp.code.language';
const traceable = (language: Language): language is Exclude<Language, 'python'> => language !== 'python';
const draftKey = (problemId: string, language: Language) => `${CODE_DRAFT_PREFIX}${problemId}.${language}`;
const SUITE_SEED = 1;
const PREVIEW_CHARS = 400;

type Panel = 'tests' | 'trace';
/** The phone's one pane at a time (REDESIGN.md 4.2); from 1024px all three show side by side. */
type Pane = 'problem' | 'code' | 'results';
const PANES: readonly SegmentOption<Pane>[] = [
  { value: 'problem', label: 'Problem' },
  { value: 'code', label: 'Code' },
  { value: 'results', label: 'Results' },
];
const ONE_COLUMN = '(max-width: 1023.98px)';

@Component({
  selector: 'app-code-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackComponent,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
    IonContent,
    IonIcon,
    CodeEditorComponent,
    LanguagePickerComponent,
    TracePlayerComponent,
    RovingSelectDirective,
    CodeTextComponent,
    TreeViewComponent,
    InterviewReportsComponent,
    SegmentedComponent,
    NgComponentOutlet,
  ],
  templateUrl: './workspace.page.html',
  styleUrl: './workspace.page.scss',
})
export class WorkspacePage {
  private readonly runner = inject(RunnerService);
  private readonly progress = inject(ProgressService);
  private readonly prefs = inject(LibraryPrefsService);
  private readonly nav = inject(NavController);
  private readonly outlet = inject(IonRouterOutlet, { optional: true });
  private readonly opened = inject(Router).currentNavigation()?.extras.state;
  /** The pattern a link named (the hub's Problems or Lesson, or Next unsolved), which the workspace then shows. */
  readonly hubPattern = (this.opened?.['pattern'] as string | undefined) ?? null;
  /** Whether that pattern's hub sits below this view: it opened this problem, or one Next unsolved replaced. */
  readonly fromHub = this.opened?.['fromHub'] === true;

  readonly id = input.required<string>();
  readonly problem = computed(() => getCodingProblem(this.id()));
  readonly exampleTrees = computed(() => {
    const problem = this.problem();
    if (!problem) return [];
    return problem.examples.map((ex) =>
      problem.params.flatMap((param, i) => {
        const tree = param.type === 'tree' ? exampleTree(ex.args[i] as LevelOrder) : null;
        return tree ? [tree] : [];
      }),
    );
  });

  readonly language = signal<Language>('python');
  /** No language stored yet: the first visit asks which one the learner will interview in. */
  readonly askLanguage = signal(false);
  readonly languages = LANGUAGES;
  readonly languageLabels = LANGUAGE_LABELS;
  readonly panes = PANES;
  readonly pane = signal<Pane>('problem');
  /** Hint rungs opened on this problem, on this device. */
  readonly hints = signal(0);
  /** XP the accepted submission earned. */
  readonly earned = signal<number | null>(null);
  readonly code = signal('');
  readonly running = signal<'run' | 'submit' | 'trace' | null>(null);
  readonly loadingMessage = this.runner.loading;
  readonly report = signal<RunReport | null>(null);
  readonly reportKind = signal<'run' | 'submit' | null>(null);
  readonly panel = signal<Panel>('tests');
  private readonly injector = inject(Injector);
  private readonly traceButton = viewChild.required<ElementRef<HTMLButtonElement>>('traceButton');
  private readonly traceNote = viewChild<ElementRef<HTMLElement>>('traceNote');
  private readonly chips = viewChild<ElementRef<HTMLElement>>('chips');
  private readonly toolbar = viewChild<ElementRef<HTMLElement>>('toolbar');
  private readonly content = viewChild(IonContent);
  private readonly resultsPanel = viewChild<ElementRef<HTMLElement>>('resultsPanel');
  private readonly oneColumn = matchMedia(ONE_COLUMN);
  /** Where Results sat on screen while one pane showed, so widening to two columns can leave it there. */
  private resultsTop: number | null = null;
  readonly panelsId = uniqueId('workspace-panels');
  readonly askId = uniqueId('ask-language');

  readonly traceExample = signal(0);
  readonly traceFrames = signal<TraceFrame[] | null>(null);
  readonly traceError = signal<RunnerError | null>(null);
  readonly traceTruncated = signal(false);
  readonly traceLine = signal<number | null>(null);

  readonly record = computed(() => this.progress.state().coding[this.id()]);
  /** The pattern the hints, Next unsolved and Back are about: the hub's, if the problem is one of its, else the first. */
  readonly focusPattern = computed(() => {
    const ids = this.problem()?.patternIds ?? [];
    return this.hubPattern && ids.includes(this.hubPattern) ? this.hubPattern : (ids[0] ?? '');
  });
  /** Pattern tags stay hidden until a solve, a hint, the hub or the tags preference shows them (REDESIGN.md 2.9). */
  readonly patternShown = computed(
    () => Boolean(this.record()?.solvedAt) || this.hints() > 0 || this.hubPattern !== null || this.prefs.showTags(),
  );
  /** Rungs the ladder shows open: a pattern already on screen is the first. */
  readonly rungs = computed(() => Math.max(this.hints(), this.patternShown() ? 1 : 0));
  /**
   * The hint ladder, with the pattern content only it reads, loads at the first idle period rather than with the problem
   * tap; the page is preloaded by then, so the ladder still works offline.
   */
  readonly hintLadder = signal<Type<unknown> | null>(null);
  readonly hintInputs = computed(() => ({
    problem: this.problem(),
    patternId: this.focusPattern(),
    shown: this.rungs(),
    reveal: this.revealHint,
  }));
  readonly nextProblem = computed(() => nextUnsolved(this.focusPattern(), this.progress.state().coding, this.id()));
  readonly canTrace = computed(() => traceable(this.language()));
  readonly focusTest = computed<TestReport | undefined>(() => this.report()?.tests.find((t) => t.status !== 'passed'));
  readonly allPassed = computed(() => {
    const r = this.report();
    return !!r && !r.compileError && r.total > 0 && r.passed === r.total;
  });
  /** What a finished run found, worded for screen readers: the results panel shows it on screen. */
  readonly outcome = computed(() => {
    const r = this.report();
    if (!r) return null;
    if (r.compileError) return `The code has an error${r.compileError.location ? ` on line ${r.compileError.location.line}` : ''}`;
    return `${r.passed} of ${r.total} ${this.reportKind() === 'run' ? 'examples' : 'tests'} passed`;
  });
  readonly errorLine = computed(() => {
    if (this.panel() === 'trace') return this.traceError()?.location?.line ?? null;
    const r = this.report();
    return r?.compileError?.location?.line ?? r?.tests.find((t) => t.error?.location)?.error?.location?.line ?? null;
  });

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private loadedFor = '';

  constructor() {
    addIcons({ playOutline, rocketOutline, footstepsOutline, refreshOutline, checkmarkCircle, closeCircle, alertCircle, stopwatchOutline });

    void firstIdle()
      .then(() => import('./hint-ladder.component'))
      .then((m) => this.hintLadder.set(m.HintLadderComponent));

    void Preferences.get({ key: LANGUAGE_KEY }).then(({ value }) => {
      if (value && (LANGUAGES as string[]).includes(value)) this.language.set(value as Language);
      else this.askLanguage.set(true);
    });

    effect(() => {
      const key = CODE_HINTS_PREFIX + this.id();
      untracked(() => this.hints.set(0));
      // A rung opened before the stored count arrives is kept.
      void Preferences.get({ key }).then(({ value }) => this.hints.update((n) => Math.max(n, Math.min(HINT_RUNGS, Number(value) || 0))));
    });

    effect(() => {
      const problem = this.problem();
      const language = this.language();
      if (!problem) return;
      const key = draftKey(problem.id, language);
      if (key === this.loadedFor) return;
      this.loadedFor = key;
      untracked(() => {
        this.report.set(null);
        this.clearTrace();
      });
      void Preferences.get({ key }).then(({ value }) => {
        if (this.loadedFor === key) this.code.set(value ?? starterCode(problem, language));
      });
    });

    const oneColumn = this.oneColumn;
    // A browser cannot keep its place when the editor appears above Results at scroll 0, as on a tablet turned sideways
    // mid-trace, so the page scrolls by as much.
    const note = () => {
      if (oneColumn.matches) this.resultsTop = this.resultsPanel()?.nativeElement.getBoundingClientRect().top ?? null;
    };
    const widened = () => {
      const results = this.resultsPanel()?.nativeElement;
      if (oneColumn.matches || this.pane() !== 'results' || !results || this.resultsTop === null) return;
      const by = results.getBoundingClientRect().top - this.resultsTop;
      void this.content()
        ?.getScrollElement()
        .then((scroller) => (scroller.scrollTop += by));
    };
    oneColumn.addEventListener('change', widened);
    addEventListener('resize', note);
    afterNextRender(async () => (await this.content()?.getScrollElement())?.addEventListener('scroll', note, { passive: true }));
    afterRenderEffect(() => {
      this.pane();
      note();
    });

    inject(DestroyRef).onDestroy(() => {
      this.runner.cancel();
      this.flushDraft();
      oneColumn.removeEventListener('change', widened);
      removeEventListener('resize', note);
    });
    onPageKey((e) => this.onRunChord(e), { kind: 'chord' });
  }

  patternName(id: string) {
    return getPatternSummary(id)?.name ?? id;
  }

  onCodeChange(value: string) {
    this.code.set(value);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushDraft(), 600);
  }

  setLanguage(language: Language) {
    this.keepLanguage(language);
    if (language === this.language()) return;
    this.flushDraft();
    this.language.set(language);
  }

  /** The first visit's answer: the row goes, so focus moves to the toolbar's language, now the chosen one. */
  answerLanguage(language: Language) {
    this.setLanguage(language);
    refocusAfterRender(this.injector, () => this.toolbar()?.nativeElement.querySelector<HTMLElement>('[aria-checked="true"]'));
  }

  /** Stores the language, which answers the first visit's question too. */
  private keepLanguage(language: Language) {
    this.askLanguage.set(false);
    void Preferences.set({ key: LANGUAGE_KEY, value: language });
  }

  readonly revealHint = (rung: number) => {
    if (rung <= this.hints()) return;
    this.hints.set(rung);
    void Preferences.set({ key: CODE_HINTS_PREFIX + this.id(), value: String(rung) });
  };

  /** "Show pattern" opens the ladder's first rung; focus moves to the pattern it shows. */
  showPattern() {
    this.revealHint(1);
    refocusAfterRender(this.injector, () => this.chips()?.nativeElement.querySelector('a'), this.chips()?.nativeElement);
  }

  /**
   * Back to the pattern's hub: a pop when the hub opened this problem (Next unsolved replaces the problem, so the hub stays
   * below), which returns to the segment the learner left; otherwise the hub's Lesson, as a back step.
   */
  backToPattern(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (this.fromHub && this.hubPattern === this.focusPattern() && this.outlet?.canGoBack()) void this.outlet.pop();
    else void this.nav.navigateBack(['/coding/patterns', this.focusPattern()]);
  }

  resetCode() {
    const problem = this.problem();
    if (problem) this.onCodeChange(starterCode(problem, this.language()));
  }

  async run() {
    const problem = this.problem();
    if (!problem || this.running()) return;
    await this.execute('run', exampleCases(problem));
  }

  async submit() {
    const problem = this.problem();
    if (!problem || this.running()) return;
    this.earned.set(null);
    const report = await this.execute('submit', buildSuite(problem, { seed: SUITE_SEED }));
    if (!report || report.compileError) return;
    if (report.passed === report.total) void haptic.success();
    const before = this.progress.state().xp;
    await this.progress.record({
      type: 'code.submitted',
      problemId: problem.id,
      language: this.language(),
      passed: report.passed,
      total: report.total,
    });
    this.earned.set(this.progress.state().xp - before);
  }

  async trace() {
    const problem = this.problem();
    const language = this.language();
    if (!problem || this.running()) return;
    this.panel.set('trace');
    this.showResults();
    if (!traceable(language)) {
      afterNextRender(
        () => {
          const note = this.traceNote()?.nativeElement;
          note?.scrollIntoView({ block: 'nearest' });
          refocus(note, this.traceButton().nativeElement);
        },
        { injector: this.injector },
      );
      return;
    }
    this.running.set('trace');
    this.clearTrace();
    const args = problem.examples[this.traceExample()]?.args ?? problem.examples[0].args;
    const result = await this.runner.trace(problem, language, this.code(), entryName(problem, language), args);
    this.running.set(null);
    if (!result.ok) {
      this.traceError.set(result.error);
      return;
    }
    this.traceTruncated.set(result.truncated);
    if (result.error) this.traceError.set(result.error);
    if (!result.steps.length) {
      this.traceError.set(result.error ?? { message: 'Nothing to trace yet: the function returned before running any statements.' });
      return;
    }
    this.traceFrames.set(toFrames(result, problem.params));
  }

  pickTraceExample(index: number) {
    this.traceExample.set(index);
    void this.trace();
  }

  describeArgs(test: TestReport | TestCase): string[] {
    return this.problem()!.params.map((p, i) => {
      const value = test.args[i];
      const size = test.kind === 'performance' ? inputSize(p.type, value) : null;
      // Performance inputs can span several megabytes and this runs on every change detection, so count nested cells before serializing.
      const length = (value as ArrayLike<unknown>).length;
      const nestedLength = Array.isArray(value) && Array.isArray(value[0]) ? value[0].length : 1;
      const text = size && length * nestedLength > PREVIEW_CHARS ? null : preview(value, Infinity);
      return text === null || (size && text.length > PREVIEW_CHARS)
        ? `${p.name}: large input, ${size}`
        : `${p.name} = ${clip(text, PREVIEW_CHARS)}`;
    });
  }

  show(test: TestReport, value: unknown): string {
    if (test.kind === 'performance' && Array.isArray(value)) return `[${value.length.toLocaleString()} items]`;
    if (test.kind === 'performance' && typeof value === 'string' && value.length > PREVIEW_CHARS)
      return `[${value.length.toLocaleString()} characters]`;
    return value === undefined ? 'undefined' : preview(value, PREVIEW_CHARS);
  }

  testLabel(test: TestReport): string {
    return (
      { example: 'Example', edge: 'Edge case', random: 'Hidden test', performance: 'Performance test' }[test.kind] + ` #${test.index + 1}`
    );
  }

  private onRunChord(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
    e.preventDefault();
    void (e.shiftKey ? this.submit() : this.run());
  }

  /** Run, Submit and Trace jump to Results where one pane shows at a time, from its top. */
  private showResults() {
    if (this.askLanguage()) this.keepLanguage(this.language());
    const switched = this.pane() !== 'results';
    this.pane.set('results');
    if (!switched || !this.oneColumn.matches) return;
    void this.content()?.scrollToTop(0);
    // The editor a chord ran from is hidden now; focus goes to Results itself, where the page's keys still step a trace.
    refocusAfterRender(this.injector, () => this.resultsPanel()?.nativeElement);
  }

  /** A pane switch starts the new pane at its top, as a page would. */
  choosePane(pane: Pane) {
    this.pane.set(pane);
    void this.content()?.scrollToTop(0);
  }

  private async execute(kind: 'run' | 'submit', cases: TestCase[]): Promise<RunReport | null> {
    const problem = this.problem()!;
    this.panel.set('tests');
    this.showResults();
    this.running.set(kind);
    this.reportKind.set(kind);
    this.report.set(null);
    try {
      const report = await this.runner.run(problem, this.language(), this.code(), entryName(problem, this.language()), cases, (partial) =>
        this.report.set(partial),
      );
      this.report.set(report);
      if (report.compileError || report.passed < report.total) void haptic.error();
      return report;
    } finally {
      this.running.set(null);
    }
  }

  private clearTrace() {
    this.traceFrames.set(null);
    this.traceError.set(null);
    this.traceTruncated.set(false);
    this.traceLine.set(null);
  }

  private flushDraft() {
    clearTimeout(this.saveTimer);
    const problem = this.problem();
    if (!problem || !this.loadedFor) return;
    const code = this.code();
    const key = draftKey(problem.id, this.language());
    if (key !== this.loadedFor) return;
    if (code === starterCode(problem, this.language())) void Preferences.remove({ key });
    else void Preferences.set({ key, value: code });
  }
}
