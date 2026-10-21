import {
  Directive,
  ElementRef,
  afterRenderEffect,
  computed,
  contentChildren,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { sameLocator, type Locator } from '@grasp/engine';

/** An open pick ask on a drawing: what labels it, how many cells make one answer, and those picked so far. */
export interface PickAsk {
  /** The id of the element that holds the ask's prompt. */
  labelledBy: string;
  /** The id of the element that says what to tap. */
  describedBy: string;
  count: 1 | 2;
  picked: readonly Locator[];
  /** Bumped to move focus into the group, as a checkpoint opens on the picture. */
  focusAt?: number;
}

/** A committed pick, drawn on the payoff's cells as the learner's guess: neutral until the step has played, then judged. */
export interface PickGhost {
  cells: readonly Locator[];
  verdict: 'pending' | 'right' | 'wrong';
}

/**
 * The cells of a drawing as one roving radio group while a pick ask is open (a group of checkboxes when two cells make an
 * answer): arrows move between cells (a grid's up and down move by `pickColumns`), Home and End go to the ends, and Enter,
 * Space or a tap picks. Focus starts on the first cell, never on one that would hint at the answer.
 */
@Directive({
  selector: '[gPickGroup]',
  host: {
    '[attr.role]': "ask() ? (ask()!.count === 2 ? 'group' : 'radiogroup') : null",
    '[attr.aria-labelledby]': 'ask()?.labelledBy ?? null',
    '[attr.aria-describedby]': 'ask()?.describedBy ?? null',
    '(keydown)': 'onKey($event)',
  },
})
export class PickGroupDirective {
  readonly ask = input<PickAsk | null>(null, { alias: 'gPickGroup' });
  readonly ghost = input<PickGhost | null>(null, { alias: 'pickGhost' });
  /** Cells per row, for a grid's up and down; 0 for one row. */
  readonly columns = input(0, { alias: 'pickColumns' });
  readonly picked = output<Locator>();
  readonly cells = contentChildren(PickCellDirective, { descendants: true });
  readonly roving = signal(0);
  private focused: number | undefined;

  constructor() {
    // After render, since a cell takes its tabindex in the same pass that opens the ask.
    afterRenderEffect(() => {
      const ask = this.ask();
      untracked(() => {
        if (!ask) this.roving.set(0);
        else if (ask.focusAt !== undefined && ask.focusAt !== this.focused) this.focusCell(0);
        this.focused = ask?.focusAt;
      });
    });
  }

  rovingIndex(cell: PickCellDirective): number {
    return this.cells().indexOf(cell);
  }

  pick(cell: PickCellDirective) {
    if (!this.ask()) return;
    this.roving.set(this.rovingIndex(cell));
    this.picked.emit(cell.at());
  }

  onKey(e: KeyboardEvent) {
    const cells = this.cells();
    if (!this.ask() || !cells.length || e.altKey || e.ctrlKey || e.metaKey) return;
    const at = this.roving();
    const row = this.columns() || 1;
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at + (this.columns() ? row : 1),
      ArrowUp: at - (this.columns() ? row : 1),
      Home: 0,
      End: cells.length - 1,
    };
    if (e.key in moves) this.focusCell(Math.max(0, Math.min(cells.length - 1, moves[e.key])));
    else if (e.key === 'Enter' || e.key === ' ') this.pick(cells[at]);
    else return;
    // The page's own keys step and seek on these, and a checkbox, unlike a radio, is not a widget they leave alone.
    e.preventDefault();
    e.stopPropagation();
  }

  private focusCell(index: number) {
    this.roving.set(index);
    this.cells()[index]?.element.focus();
  }
}

/** One pickable cell of a `gPickGroup`: a radio (or checkbox) while the ask is open, and the learner's ghost after it. */
@Directive({
  selector: '[gPickCell]',
  host: {
    'data-pick': '',
    '[attr.role]': "open() ? (group.ask()!.count === 2 ? 'checkbox' : 'radio') : null",
    '[attr.tabindex]': 'open() ? (group.rovingIndex(this) === group.roving() ? 0 : -1) : null',
    '[attr.aria-checked]': 'open() ? checked() : null',
    '[attr.aria-label]': 'open() ? pickLabel() : null',
    '[class.pickable]': 'open()',
    '[class.picked]': 'open() && checked()',
    '[class.you]': '!!ghost()',
    '[class.you-right]': "ghost() === 'right'",
    '[class.you-wrong]': "ghost() === 'wrong'",
    '(click)': 'group.pick(this)',
  },
})
export class PickCellDirective {
  readonly at = input.required<Locator>({ alias: 'gPickCell' });
  /** What a screen reader hears for the cell while it can be picked, such as "index 3, 16". */
  readonly pickLabel = input('');
  protected readonly group = inject(PickGroupDirective);
  readonly element: HTMLElement = inject(ElementRef).nativeElement;
  readonly open = computed(() => !!this.group.ask());
  readonly checked = computed(() => !!this.group.ask()?.picked.some((p) => sameLocator(p, this.at())));
  readonly ghost = computed(() => {
    const ghost = this.group.ghost();
    return ghost?.cells.some((c) => sameLocator(c, this.at())) ? ghost.verdict : null;
  });
}

/**
 * Pick and ghost styles for a view's cells (REDESIGN.md 3.6 and 3.8): the accent only on hover and focus, the same on every
 * cell so neither hints at the answer; a picked cell before Lock it in, and the learner's guess, neutral and dashed, final
 * and solid when right, critical when wrong. Inset, as the considering outline is, so a scrolling array's ends never clip
 * them.
 */
export const PICK_CELL = `
  .pickable {
    cursor: pointer;
  }
  @media (hover: hover) {
    .pickable:hover {
      outline: 2px solid var(--g-accent);
      outline-offset: -1px;
    }
  }
  .pickable:focus-visible {
    outline: 2px solid var(--g-accent);
    outline-offset: -1px;
  }
  .picked,
  .you {
    outline: 2px dashed var(--g-viz-guess);
    outline-offset: -1px;
  }
  .you-right {
    outline-style: solid;
    outline-color: var(--g-viz-final);
  }
  .you-wrong {
    outline-color: var(--g-viz-critical);
  }
`;
