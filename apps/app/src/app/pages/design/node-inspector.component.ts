import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonIcon } from '@ionic/angular';
import { SHARD_KEYS, fmt, type ComponentSpec, type DesignNode, type NodeStats, type ShardKey } from '@grasp/engine';
import { addIcons } from 'ionicons';
import { add, closeCircleOutline, flash, gitCommitOutline, remove, skullOutline, trashOutline } from 'ionicons/icons';
import { RovingSelectDirective } from '../../core/roving-select.directive';

export interface InspectorLink {
  key: string;
  name: string;
  rps: number;
}

export interface InspectorTarget {
  id: string;
  name: string;
}

@Component({
  selector: 'app-node-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, IonIcon, RovingSelectDirective],
  templateUrl: './node-inspector.component.html',
  styleUrl: './node-inspector.component.scss',
})
export class NodeInspectorComponent {
  readonly node = input.required<DesignNode>();
  readonly stats = input.required<NodeStats>();
  readonly spec = input.required<ComponentSpec>();
  readonly outgoing = input.required<InspectorLink[]>();
  readonly connectTargets = input.required<InspectorTarget[]>();
  readonly connecting = input.required<boolean>();
  readonly targetsLabelId = input.required<string>();

  readonly close = output();
  readonly stepInstances = output<number>();
  readonly update = output<Partial<DesignNode>>();
  readonly deleteEdge = output<string>();
  readonly startConnect = output();
  readonly connectTo = output<string>();
  readonly failInstance = output();
  readonly recover = output();
  readonly remove = output();

  readonly connectButton = viewChild<ElementRef<HTMLElement>>('connectButton');
  readonly killButton = viewChild<ElementRef<HTMLElement>>('killButton');
  readonly recoverButton = viewChild<ElementRef<HTMLElement>>('recoverButton');
  readonly targets = viewChild<ElementRef<HTMLElement>>('targets');

  readonly shardKeys = (Object.keys(SHARD_KEYS) as ShardKey[]).map((id) => ({ id, ...SHARD_KEYS[id] }));
  readonly fmt = fmt;

  constructor() {
    addIcons({ add, remove, closeCircleOutline, trashOutline, gitCommitOutline, skullOutline, flash });
  }

  shardKeyDetail(n: DesignNode) {
    const key = SHARD_KEYS[n.shardKey ?? 'hash'];
    return `${key.label}: ${key.detail}`;
  }
}
