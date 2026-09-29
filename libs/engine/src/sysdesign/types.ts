export type ComponentKind = 'client' | 'cdn' | 'limiter' | 'lb' | 'app' | 'cache' | 'db' | 'replica' | 'queue' | 'worker' | 'blob';

/** How a sharded database assigns keys to shards. */
export type ShardKey = 'hash' | 'time' | 'tenant';

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
  /** Object stores only: the share of app requests that read or write whole objects. */
  share?: number;
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
  share?: number;
  /** The role this node plays in a case study, shown in place of the component name. */
  label?: string;
  /** Databases only: with several instances, each instance is a shard owning part of the keys. */
  shardKey?: ShardKey;
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
  /** Abusive automated traffic (scrapers, credential stuffing) on top of rps. It is never counted as user errors. */
  botRps?: number;
}

export type NodeStatus = 'idle' | 'ok' | 'hot' | 'overloaded' | 'down';

export interface NodeStats {
  readRps: number;
  writeRps: number;
  backgroundRps: number;
  replicationRps: number;
  botRps: number;
  loadOps: number;
  capacityOps: number;
  utilization: number;
  latencyMs: number;
  droppedRps: number;
  absorbedRps: number;
  status: NodeStatus;
  /** Sharded databases only, hottest shard first. */
  shards?: ShardStats[];
}

export interface ShardStats {
  utilization: number;
  down: boolean;
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
  botRps: number;
  botsBlockedRps: number;
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
  /** Sustained load: the queue backlog must not grow at all. */
  noBacklog?: boolean;
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
  variants?: readonly ScenarioVariant[];
  /** Set when this scenario object is a revisit variant. */
  revisit?: { number: number; of: number; twist: string };
}

export interface GoalCheck {
  id: string;
  label: string;
  pass: boolean;
  actual: string;
}
