import { authStoreContract } from './auth-store.contract.js';
import { MemoryAuthStore } from './memory.stores.js';

authStoreContract('in-memory', () => new MemoryAuthStore());
