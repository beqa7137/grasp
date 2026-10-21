import { Injectable } from '@angular/core';
import { PHASES, type VizEvent } from '@grasp/engine';

/** The step the stage shows: the changes into its frame and how they play (REDESIGN.md 3.5). */
export interface StageStep {
  /** Counts up with every step, so a view can tell a new step from a re-render. */
  id: number;
  /** The changes into the frame on show; empty after a jump or on a new run. */
  events: readonly VizEvent[];
  /** Whether the frame is one step from the last one shown, rather than a jump or a new run. */
  adjacent: boolean;
  /** What the theme's motion durations are multiplied by; 0 when nothing animates (reduced motion, the test mode, Instant). */
  scale: number;
  /** A deliberate jump (restart, a checkpoint, the result), which crossfades; scrubbing snaps. */
  jump: boolean;
}

export type MotionToken = 'quick' | 'step' | 'layout' | 'land';
const TOKENS: MotionToken[] = ['quick', 'step', 'layout', 'land'];

/** A CSS time in ms: browsers may serialize a token's `120ms` as `0.12s`. */
const toMs = (time: string) => {
  const value = parseFloat(time) || 0;
  return time.trim().endsWith('ms') ? value : value * 1000;
};

/** At most this many animations run at once (3.5); a step that would start more snaps the rest. */
export const MAX_ANIMATIONS = 60;

/**
 * Runs the stage's script animations (REDESIGN.md 3.5): Web Animations on transform and opacity only, at most 60 at once,
 * and every one finished before the next step starts, so holding a step key never builds a backlog. The global
 * reduced-motion rule does not reach script animations, so the player passes a scale of 0 for those steps instead.
 */
@Injectable()
export class MotionService {
  private readonly live = new Set<Animation>();
  private base: Record<MotionToken, number> | null = null;
  private readonly curves: Partial<Record<'standard' | 'enter' | 'exit', string>> = {};

  /** A token's duration in ms at this step's scale, from the theme's `--g-motion-*` tokens. */
  ms(token: MotionToken, scale: number): number {
    this.base ??= Object.fromEntries(
      TOKENS.map((t) => [t, toMs(getComputedStyle(document.documentElement).getPropertyValue(`--g-motion-${t}`))]),
    ) as Record<MotionToken, number>;
    return this.base[token] * scale;
  }

  /** One of the theme's easing curves (`--g-ease-*`). */
  ease(curve: 'standard' | 'enter' | 'exit'): string {
    return (this.curves[curve] ??= getComputedStyle(document.documentElement).getPropertyValue(`--g-ease-${curve}`).trim() || 'ease');
  }

  /** A phase's start in ms at this step's scale: cause, change or consequence. */
  at(phase: keyof typeof PHASES, scale: number): number {
    return PHASES[phase] * scale;
  }

  /** The theme's motion tokens at this scale, as CSS times for the stage's own transitions. */
  tokens(scale: number): Record<MotionToken, string> {
    return Object.fromEntries(TOKENS.map((t) => [t, `${this.ms(t, scale)}ms`])) as Record<MotionToken, string>;
  }

  animate(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
    if (this.live.size >= MAX_ANIMATIONS || typeof el.animate !== 'function') return null;
    const animation = el.animate(keyframes, { fill: 'backwards', ...options });
    this.live.add(animation);
    const done = () => this.live.delete(animation);
    animation.addEventListener('finish', done);
    animation.addEventListener('cancel', done);
    return animation;
  }

  /** Ends every animation on `root` at its final state: the script ones this service started and the CSS transitions. */
  finishAll(root?: Element | null): void {
    for (const animation of [...this.live, ...(root?.getAnimations?.({ subtree: true }) ?? [])]) {
      try {
        animation.finish();
      } catch {
        // An endless animation cannot finish; it must not stop the step either.
        animation.cancel();
      }
    }
    this.live.clear();
  }
}
