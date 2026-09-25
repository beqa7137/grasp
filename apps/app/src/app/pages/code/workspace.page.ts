import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import {
  LANGUAGES,
  PATTERNS,
  buildSuite,
  entryName,
  exampleCases,
  getCodingProblem,
  inputSize,
  preview,
  starterCode,
  type Language,
  type LevelOrder,
  type TestCase,
} from '@grasp/engine';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
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
import { LanguagePickerComponent } from '../../code/language-picker.component';
import type { RunnerError } from '../../code/protocol';
import { RunnerService, type RunReport, type TestReport } from '../../code/runner.service';
import { toFrames, type TraceFrame } from '../../code/trace-frames';
import { TracePlayerComponent } from '../../code/trace-player.component';
import { exampleTree } from '../../code/tree-frames';
import { haptic } from '../../core/haptics';
import { onPageKey } from '../../core/on-page-key';
import { ProgressService } from '../../core/progress.service';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { uniqueId } from '../../core/unique-id';
import { CodeTextComponent } from '../../viz/code-text.component';
import { TreeViewComponent } from '../../viz/tree-view.component';

const LANGUAGE_KEY = 'grasp.code.language';
const draftKey = (problemId: string, language: Language) => `grasp.code.draft.${problemId}.${language}`;
const SUITE_SEED = 1;
const patternNames = new Map(PATTERNS.map((p) => [p.id, p.name]));

type Panel = 'tests' | 'trace';

@Component({
  selector: 'app-code-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonIcon,
    CodeEditorComponent,
    LanguagePickerComponent,
    TracePlayerComponent,
    RovingSelectDirective,
    CodeTextComponent,
    TreeViewComponent,
  ],
  templateUrl: './workspace.page.html',
  styleUrl: './workspace.page.scss',
})
export class WorkspacePage {
  private readonly runner = inject(RunnerService);
  private readonly progress = inject(ProgressService);

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
  readonly code = signal('');
  readonly running = signal<'run' | 'submit' | 'trace' | null>(null);
  readonly loadingMessage = this.runner.loading;
  readonly report = signal<RunReport | null>(null);
  readonly reportKind = signal<'run' | 'submit' | null>(null);
  readonly panel = signal<Panel>('tests');
  readonly panelsId = uniqueId('workspace-panels');

  readonly traceExample = signal(0);
  readonly traceFrames = signal<TraceFrame[] | null>(null);
  readonly traceError = signal<RunnerError | null>(null);
  readonly traceTruncated = signal(false);
  readonly traceLine = signal<number | null>(null);

  readonly record = computed(() => this.progress.state().coding[this.id()]);
  readonly canTrace = computed(() => this.language() !== 'python');
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

    void Preferences.get({ key: LANGUAGE_KEY }).then(({ value }) => {
      if (value && (LANGUAGES as string[]).includes(value)) this.language.set(value as Language);
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

    inject(DestroyRef).onDestroy(() => {
      this.runner.cancel();
      this.flushDraft();
    });
    onPageKey((e) => this.onRunChord(e), { kind: 'chord' });
  }

  patternName(id: string) {
    return patternNames.get(id) ?? id;
  }

  onCodeChange(value: string) {
    this.code.set(value);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushDraft(), 600);
  }

  setLanguage(language: Language) {
    if (language === this.language()) return;
    this.flushDraft();
    this.language.set(language);
    void Preferences.set({ key: LANGUAGE_KEY, value: language });
    if (language === 'python' && this.panel() === 'trace') this.panel.set('tests');
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
    const report = await this.execute('submit', buildSuite(problem, { seed: SUITE_SEED }));
    if (!report || report.compileError) return;
    if (report.passed === report.total) void haptic.success();
    await this.progress.record({
      type: 'code.submitted',
      problemId: problem.id,
      language: this.language(),
      passed: report.passed,
      total: report.total,
    });
  }

  async trace() {
    const problem = this.problem();
    const language = this.language();
    if (!problem || this.running() || language === 'python') return;
    this.panel.set('trace');
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
      if (test.kind !== 'performance') return `${p.name} = ${preview(value, 400)}`;
      const size = inputSize(p.type, value);
      return size ? `${p.name}: large input, ${size}` : `${p.name} = ${preview(value)}`;
    });
  }

  show(test: TestReport, value: unknown): string {
    if (test.kind === 'performance' && Array.isArray(value)) return `[${value.length.toLocaleString()} items]`;
    return value === undefined ? 'undefined' : preview(value, 400);
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

  private async execute(kind: 'run' | 'submit', cases: TestCase[]): Promise<RunReport | null> {
    const problem = this.problem()!;
    this.panel.set('tests');
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
