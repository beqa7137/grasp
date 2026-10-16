import { readFileSync } from 'node:fs';
import { isUtility } from './rail';
import { type IonicView, ionicStack, openOnTodayStack, planUtility } from './utility-nav';

const IONIC = '../../node_modules/@ionic/angular/dist/common/directives/navigation/';

function view(url: string): IonicView & { destroyed: boolean } {
  const v = {
    stackId: url.split('/')[1],
    url,
    destroyed: false,
    ref: { destroy: () => (v.destroyed = true) },
    unlistenEvents: () => undefined,
  };
  return v;
}

describe('opening a rail utility', () => {
  it("reads the stack controller Ionic's outlet holds, in the shape this relies on", () => {
    const outlet = readFileSync(IONIC + 'router-outlet.js', 'utf8');
    const controller = readFileSync(IONIC + 'stack-controller.js', 'utf8');
    const utils = readFileSync(IONIC + 'stack-utils.js', 'utf8');
    expect(outlet).toContain('this.stackCtrl = new StackController(');
    expect(controller).toMatch(/^\s+views = \[\];$/m);
    expect(controller).toContain('this.activeView = enteringView;');
    expect(controller).toContain('this.views.splice(-1, 1);');
    expect(utils).toMatch(/view\.ref\.destroy\(\);\s+view\.unlistenEvents\(\);/);
    expect(ionicStack({ stackCtrl: { views: [] } })).not.toBeNull();
    expect(ionicStack({})).toBeNull();
    expect(ionicStack(undefined)).toBeNull();
  });

  it('keeps the Today stack under its lowest utility page, even when a page was opened above it', () => {
    const [today, plan, review, coding] = ['/today', '/today/plan', '/today/review', '/coding'].map(view);
    expect(planUtility([today, coding, plan, review], review, isUtility)).toEqual({
      kept: [today],
      dropped: [plan, review],
      replace: true,
    });
    expect(planUtility([today, plan, coding], coding, isUtility)).toEqual({ kept: [today], dropped: [plan], replace: false });
    expect(planUtility([today, coding], coding, isUtility)).toEqual({ kept: [today], dropped: [], replace: false });
  });

  it('navigates once and puts the kept views back under the new page, destroying the dropped ones it hid', async () => {
    const [today, plan, review, coding, settings] = ['/today', '/today/plan', '/today/review', '/coding', '/today/settings'].map(view);
    const stack = { views: [today, coding, plan, review], activeView: review as IonicView };
    const replaces: boolean[] = [];
    await openOnTodayStack(stack, isUtility, async (replace) => {
      replaces.push(replace);
      // What Ionic does: it drops its last view for replaceUrl, then pushes the entering one.
      expect(stack.views).toEqual([coding, review]);
      stack.views = [coding, settings];
      stack.activeView = settings;
      return true;
    });
    expect(replaces).toEqual([true]);
    expect(stack.views).toEqual([coding, today, settings]);
    expect([plan.destroyed, review.destroyed, today.destroyed]).toEqual([true, false, false]);
  });

  it('restores the stack when the navigation does not happen, and navigates plainly without the stack', async () => {
    const [today, plan, coding] = ['/today', '/today/plan', '/coding'].map(view);
    const stack = { views: [today, plan, coding], activeView: coding as IonicView };
    await openOnTodayStack(stack, isUtility, async () => false);
    expect(stack.views).toEqual([today, plan, coding]);
    expect(plan.destroyed).toBe(false);
    const calls: boolean[] = [];
    await openOnTodayStack(null, isUtility, async (replace) => calls.push(replace) > 0);
    expect(calls).toEqual([false]);
  });
});
