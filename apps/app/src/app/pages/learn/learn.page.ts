import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular';
import { ALGORITHMS, CODING_PROBLEMS, PATTERNS, SCENARIOS, SD_TOPICS, getScenario, type Track } from '@grasp/engine';
import { addIcons } from 'ionicons';
import {
  chatbubblesOutline,
  cloudDoneOutline,
  codeSlashOutline,
  cloudOfflineOutline,
  compassOutline,
  flame,
  flashOutline,
  gitNetworkOutline,
  pulseOutline,
  playCircleOutline,
  settingsOutline,
  sparkles,
} from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { ProgressService } from '../../core/progress.service';
import { DiagnosticPromptService } from '../diagnostic/diagnostic-prompt.service';
import { MasteryRingComponent } from '../../viz/mastery-ring.component';

const TRACKS: { id: Track; title: string; blurb: string }[] = [
  { id: 'foundations', title: 'Foundations', blurb: 'The four patterns behind a third of all interview questions.' },
  { id: 'core', title: 'Core patterns', blurb: 'Stacks, sweeps and heaps — where O(n²) becomes O(n).' },
  { id: 'graphs', title: 'Graphs & trees', blurb: 'Traversal, ordering, connectivity, shortest paths.' },
  { id: 'advanced', title: 'Advanced', blurb: 'Dynamic programming, tries, greedy proofs, bits.' },
];

@Component({
  selector: 'app-learn',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonContent, IonIcon, MasteryRingComponent],
  templateUrl: './learn.page.html',
  styleUrl: './learn.page.scss',
})
export class LearnPage {
  readonly progress = inject(ProgressService);
  readonly auth = inject(AuthService);
  readonly diagnosticPrompt = inject(DiagnosticPromptService);
  readonly patternCount = PATTERNS.length;
  readonly tracks = TRACKS.map((t) => ({ ...t, patterns: PATTERNS.filter((p) => p.track === t.id) }));

  readonly sdTopics = SD_TOPICS;
  readonly masteryById = computed(() => new Map(this.progress.mastery().map((m) => [m.topic, m])));
  readonly overall = computed(() => {
    const list = this.progress.mastery();
    return list.reduce((s, m) => s + m.mastery, 0) / Math.max(1, list.length);
  });
  readonly nextAlgorithm = computed(() => {
    const preds = this.progress.state().predictions;
    return [...ALGORITHMS].sort((a, b) => (preds[a.patternId]?.total ?? 0) - (preds[b.patternId]?.total ?? 0))[0];
  });
  readonly nextProblem = computed(() => CODING_PROBLEMS.find((p) => !this.progress.state().coding[p.id]?.solvedAt) ?? CODING_PROBLEMS[0]);
  readonly nextScenario = computed(() => SCENARIOS.find((s) => !this.progress.state().missions[s.id]) ?? SCENARIOS[0]);
  readonly offerDiagnostic = computed(() => !this.progress.state().diagnosedAt && !this.diagnosticPrompt.dismissed());
  readonly revisit = computed(() => {
    const m = this.progress.dueMissions()[0];
    return m ? { ...m, title: getScenario(m.scenarioId)!.title } : null;
  });
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  });

  constructor() {
    addIcons({
      settingsOutline,
      codeSlashOutline,
      flame,
      sparkles,
      flashOutline,
      playCircleOutline,
      gitNetworkOutline,
      chatbubblesOutline,
      cloudDoneOutline,
      cloudOfflineOutline,
      compassOutline,
      pulseOutline,
    });
  }

  ionViewWillEnter() {
    this.progress.now.set(new Date());
  }

  mastery(topic: string) {
    return this.masteryById().get(topic)?.mastery ?? 0;
  }
}
