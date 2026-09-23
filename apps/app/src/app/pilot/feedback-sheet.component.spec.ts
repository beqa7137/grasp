import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../core/api.service';
import { FeedbackSheetComponent } from './feedback-sheet.component';

function setup(post: (path: string, body: unknown) => Promise<unknown>) {
  TestBed.configureTestingModule({
    imports: [FeedbackSheetComponent],
    providers: [provideRouter([]), { provide: ApiService, useValue: { post } }],
  });
  const fixture = TestBed.createComponent(FeedbackSheetComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, sheet: fixture.componentInstance };
}

const sendButton = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Send')!;

describe('FeedbackSheetComponent', () => {
  it('only allows sending once there is a message', () => {
    const { fixture, el, sheet } = setup(async () => ({}));
    expect(sendButton(el).disabled).toBe(true);
    sheet.message.set('   ');
    fixture.detectChanges();
    expect(sendButton(el).disabled).toBe(true);
    sheet.message.set('The timeline jumped');
    fixture.detectChanges();
    expect(sendButton(el).disabled).toBe(false);
  });

  it('sends kind, trimmed message, rating and context, then thanks the learner', async () => {
    const calls: [string, any][] = [];
    const { fixture, el, sheet } = setup(async (path, body) => calls.push([path, body]));
    sheet.kind.set('idea');
    sheet.message.set('  Add a dark/light toggle  ');
    sheet.toggleRating(4);
    await sheet.send();
    fixture.detectChanges();

    expect(calls).toEqual([
      [
        '/feedback',
        { kind: 'idea', message: 'Add a dark/light toggle', rating: 4, context: { route: '/', release: null, platform: 'web' } },
      ],
    ]);
    expect(el.textContent).toContain('Thank you');
  });

  it('lets the learner clear a rating by tapping it again', () => {
    const { sheet } = setup(async () => ({}));
    sheet.toggleRating(2);
    sheet.toggleRating(2);
    expect(sheet.rating()).toBeNull();
  });

  it('keeps the draft and explains when sending fails', async () => {
    const { fixture, el, sheet } = setup(async () => {
      throw new ApiError(429, 'ThrottlerException: Too Many Requests');
    });
    sheet.message.set('Something broke');
    await sheet.send();
    fixture.detectChanges();
    expect(el.querySelector('.error')?.textContent).toContain('Too Many Requests');
    expect(sheet.message()).toBe('Something broke');
    expect(sheet.sent()).toBe(false);
  });
});
