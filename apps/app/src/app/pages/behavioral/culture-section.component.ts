import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMPANY_NAMES, COMPETENCY_CATALOG, QUESTION_PROMPTS, cultureFor, type TargetCompany } from '@grasp/engine';
import { SectionComponent } from '../../ui/section.component';

export { attributesOfCompetency } from '@grasp/engine';

/** The Target company's culture mapping with every reason (REDESIGN.md R51), loaded only for an offered company. */
@Component({
  selector: 'app-culture-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SectionComponent],
  template: `
    @if (culture(); as c) {
      <g-section class="culture" [heading]="c.company + ' culture'">
        <p class="lead">What {{ c.company }} says it looks for, and what here practices each one.</p>
        @for (a of c.attributes; track a.id) {
          <h3>{{ a.name }}</h3>
          @if (!a.competencies.length) {
            <p class="uncovered">Not covered yet by a competency.{{ a.questions.length ? ' These questions touch it:' : '' }}</p>
          }
          <ul class="practices">
            @for (p of a.competencies; track p.id) {
              <li>
                <a [routerLink]="['/behavioral', p.id]">{{ p.name }}</a>
                <span class="reason">{{ p.reason }}</span>
              </li>
            }
            @for (p of a.questions; track p.id) {
              <li>
                <a [routerLink]="['/behavioral/question', p.id]">{{ p.name }}</a>
                <span class="reason">{{ p.reason }}</span>
              </li>
            }
          </ul>
        }
        <p class="more"><a routerLink="/behavioral/questions" [queryParams]="{ culture: c.first }">Filter questions by culture →</a></p>
      </g-section>
    }
  `,
  styles: `
    .culture {
      margin-top: var(--g-space-5);
      h3 {
        margin: var(--g-space-4) 0 var(--g-space-1);
        font-size: var(--g-text-body);
      }
    }
    .lead,
    .uncovered,
    .more {
      margin: 0;
      font-size: var(--g-text-body-s);
      line-height: 1.5;
      color: var(--g-muted);
    }
    .uncovered {
      margin-bottom: var(--g-space-2);
    }
    .more {
      margin: var(--g-space-4) 0 var(--g-space-2);
      a {
        font-weight: 600;
      }
    }
    .practices {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: var(--g-space-2);
      font-size: var(--g-text-body-s);
      line-height: 1.45;
      li {
        display: grid;
      }
      a {
        font-weight: 600;
      }
      .reason {
        color: var(--g-muted);
      }
    }
  `,
})
export class CultureSectionComponent {
  readonly company = input<TargetCompany | null>(null);
  readonly culture = computed(() => {
    const company = this.company();
    if (!company) return null;
    const attributes = cultureFor(company).map((a) => ({
      ...a,
      competencies: a.competencies.map((p) => ({ ...p, name: COMPETENCY_CATALOG.find((c) => c.id === p.id)?.name ?? p.id })),
      questions: a.questions.map((p) => ({ ...p, name: QUESTION_PROMPTS.find((q) => q.id === p.id)?.prompt ?? p.id })),
    }));
    return { company: COMPANY_NAMES[company], attributes, first: attributes[0].id };
  });
}
