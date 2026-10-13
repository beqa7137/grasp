import { TestBed } from '@angular/core/testing';
import { SliderComponent } from './slider.component';

function setup() {
  const fixture = TestBed.createComponent(SliderComponent);
  fixture.componentRef.setInput('label', 'Read time');
  fixture.componentRef.setInput('min', 0);
  fixture.componentRef.setInput('max', 200);
  fixture.componentRef.setInput('value', 50);
  fixture.componentRef.setInput('valueText', '50 ms');
  fixture.detectChanges();
  const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
  return { fixture, input, slider: fixture.componentInstance };
}

describe('SliderComponent', () => {
  it('is a native range input, named, with its value spoken as text', () => {
    const { input } = setup();
    expect(input.type).toBe('range');
    expect(input.getAttribute('aria-label')).toBe('Read time');
    expect(input.getAttribute('aria-valuetext')).toBe('50 ms');
    expect(input.min).toBe('0');
    expect(input.max).toBe('200');
    expect(input.value).toBe('50');
    expect(input.style.getPropertyValue('--g-slider-fill')).toBe('25%');
  });

  it('reports a moved thumb through the model and fills to it', () => {
    const { fixture, input, slider } = setup();
    input.value = '150';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(slider.value()).toBe(150);
    expect(input.style.getPropertyValue('--g-slider-fill')).toBe('75%');
  });
});
