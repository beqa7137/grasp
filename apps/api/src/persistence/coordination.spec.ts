import { coordinationContract } from './coordination.contract.js';
import { MemoryCoordinationStore } from './memory.stores.js';

coordinationContract('in-memory', () => new MemoryCoordinationStore());
