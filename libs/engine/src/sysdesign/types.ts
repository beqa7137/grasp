export type ComponentKind = 'client' | 'cdn' | 'lb' | 'app' | 'cache' | 'db' | 'replica' | 'queue' | 'worker';

export interface ComponentSpec {
  kind: ComponentKind;
  name: string;
  short: string;
  description: string;
  capacityRps: number;
  baseLatencyMs: number;
  monthlyCost: number;
  maxInstances: number;
  writeCost: number;
  hitRate?: number;
  connectsTo: ComponentKind[];
}

export interface DesignNode {
  id: string;
  kind: ComponentKind;
  x: number;
  y: number;
  instances: number;
  failed?: number;
  hitRate?: number;
}

export interface DesignEdge {
  from: string;
  to: string;
}

export interface Design {
  nodes: DesignNode[];
  edges: DesignEdge[];
}

export interface Workload {
  rps: number;
  readRatio: number;
}

export type NodeStatus = 'idle' | 'ok' | 'hot' | 'overloaded' | 'down';

export interface NodeStats {
  readRps: number;
  writeRps: number;
  backgroundRps: number;
  replicationRps: number;
  loadOps: number;
  capacityOps: number;
  utilization: number;
  latencyMs: number;
  droppedRps: number;
  absorbedRps: number;
  status: NodeStatus;
}

export type Severity = 'critical' | 'warning' | 'tip';

export interface Insight {
  severity: Severity;
  nodeId?: string;
  title: string;
  detail: string;
}

export interface SimMetrics {
  offeredRps: number;
  successRps: number;
  errorRate: number;
  p50Ms: number;
  p99Ms: number;
  readP99Ms: number;
  writeP99Ms: number;
  monthlyCost: number;
  backlogGrowthPerSec: number;
  queueDrainRps: number;
  durableWriteRatio: number;
}

export interface SimResult {
  nodes: Record<string, NodeStats>;
  edges: Record<string, number>;
  metrics: SimMetrics;
  insights: Insight[];
}

export interface ScenarioGoals {
  maxP99Ms: number;
  maxErrorRate: number;
  maxMonthlyCost: number;
  noSinglePointOfFailure?: boolean;
  spikeSeconds?: number;
  maxDrainMinutes?: number;
  requireDurableWrites?: boolean;
}

export interface ScenarioVariant {
  twist: string;
  workload: Workload;
  goals: ScenarioGoals;
}

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  brief: string;
  workload: Workload;
  goals: ScenarioGoals;
  starter: Design;
  hints: string[];
  takeaway: string;
  /** Changed conditions used for spaced revisits of a completed mission. */
  variants?: ScenarioVariant[];
  /** Set when this scenario object is a revisit variant. */
  revisit?: { number: number; of: number; twist: string };
}

export interface GoalCheck {
  id: string;
  label: string;
  pass: boolean;
  actual: string;
}
