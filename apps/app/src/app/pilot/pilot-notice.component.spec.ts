import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AI_DISCLOSURE } from '../core/ai-disclosure';
import { PilotNoticeComponent } from './pilot-notice.component';

describe('PilotNoticeComponent', () => {
  it('tells new learners what AI mode sends, in the same words as Settings, behavioral answers included', () => {
    TestBed.configureTestingModule({ imports: [PilotNoticeComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PilotNoticeComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(AI_DISCLOSURE);
    expect(AI_DISCLOSURE).toContain('behavioral answers');
    expect(text).toContain("are sent to OpenAI's GPT-6 Luna through Vercel's AI Gateway to write replies and scores");
  });
});
