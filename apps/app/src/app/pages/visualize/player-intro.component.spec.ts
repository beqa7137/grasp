import { TestBed } from '@angular/core/testing';
import { PopoverController } from '@ionic/angular';
import { getAlgorithm, type AlgorithmDef } from '@grasp/engine';
import { PlayerIntroComponent } from './player-intro.component';

describe('PlayerIntroComponent', () => {
  const click = (init: MouseEventInit = {}) => {
    const dismiss = vi.fn(async () => true);
    TestBed.configureTestingModule({ providers: [{ provide: PopoverController, useValue: { dismiss } }] });
    const fixture = TestBed.createComponent(PlayerIntroComponent);
    fixture.componentInstance.algo = getAlgorithm('binary-search') as AlgorithmDef;
    fixture.componentInstance.problem = { id: 'binary-search', title: 'Binary Search' } as PlayerIntroComponent['problem'];
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.code-it')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    link.dispatchEvent(event);
    return { dismiss, prevented: event.defaultPrevented };
  };

  it('closes with the choice and leaves the navigation to the page on a plain click', () => {
    const { dismiss, prevented } = click();
    expect(dismiss).toHaveBeenCalledWith('code');
    expect(prevented).toBe(true);
  });

  it('lets a modified click open the link in a new tab', () => {
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      TestBed.resetTestingModule();
      const { dismiss, prevented } = click(init);
      expect(dismiss).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    }
  });
});
