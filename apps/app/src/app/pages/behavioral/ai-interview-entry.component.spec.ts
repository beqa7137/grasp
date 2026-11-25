import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { replay, type OfferedCompany, type StoredEvent } from '@grasp/engine';
import { TargetCompanyService } from '../../companies/target-company.service';
import { ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import { AiInterviewEntryComponent } from './ai-interview-entry.component';

function setup(company: OfferedCompany | null) {
  const events: StoredEvent[] = [];
  const state = signal(replay(events));
  const api = { post: vi.fn(async () => ({ id: 'session' })) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: Router, useValue: { navigateByUrl: vi.fn(async () => true), url: '/behavioral/question/learning-1' } },
      { provide: ProgressService, useValue: { state } },
      { provide: TargetCompanyService, useValue: { company: signal(company) } },
    ],
  }).overrideComponent(AiInterviewEntryComponent, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(AiInterviewEntryComponent);
  fixture.componentRef.setInput('problemId', 'learning-1');
  fixture.detectChanges();
  return { entry: fixture.componentInstance, api };
}

describe('AiInterviewEntryComponent', () => {
  it("sends the Target's offered company, so the interviewer probes its culture", async () => {
    const { entry, api } = setup('microsoft');
    await entry.start('offline');
    expect(api.post).toHaveBeenLastCalledWith('/interview/sessions', {
      track: 'behavioral',
      problemId: 'learning-1',
      mode: 'offline',
      level: 'mid',
      company: 'microsoft',
    });
  });

  it('sends no company without an offered one', async () => {
    const { entry, api } = setup(null);
    await entry.start('ai');
    expect(api.post).toHaveBeenLastCalledWith('/interview/sessions', {
      track: 'behavioral',
      problemId: 'learning-1',
      mode: 'ai',
      level: 'mid',
    });
  });
});
