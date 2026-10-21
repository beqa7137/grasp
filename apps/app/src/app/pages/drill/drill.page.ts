import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { lessonLink } from '../../core/links';
import { BackComponent } from '../../ui/back.component';
import { DrillSessionComponent } from './drill-session.component';

/** Today's review, Weak spots' drill and a design topic's drill: a session on a page of its own. */
@Component({
  selector: 'app-drill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackComponent, IonHeader, IonToolbar, IonButtons, IonTitle, IonContent, DrillSessionComponent],
  template: `
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start"><app-back [href]="backHref()" /></ion-buttons>
        <ion-title>{{ practice() ? 'Drill' : 'Review' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
      <app-drill-session [pattern]="pattern()" [weakSpots]="weakSpots()" [topics]="topics()" />
    </ion-content>
  `,
  styles: `
    // The session's sticky rating bar measures itself into --actions-h; see its styles.
    @media (max-width: 1023.98px) and (min-height: 480px) {
      ion-content::part(scroll) {
        scroll-padding-bottom: calc(var(--actions-h, 0px) + var(--offset-bottom, 0px));
      }
    }
  `,
})
export class DrillPage {
  readonly pattern = input<string>();
  readonly weakSpots = input(false);
  readonly topics = input<string>();
  private readonly session = viewChild.required(DrillSessionComponent);
  readonly practice = computed(() => Boolean(this.pattern()) || this.weakSpots());
  readonly backHref = computed(() => {
    const id = this.pattern();
    return id ? lessonLink(id) : '/today';
  });

  ionViewWillEnter() {
    this.session().ionViewWillEnter();
  }
}
