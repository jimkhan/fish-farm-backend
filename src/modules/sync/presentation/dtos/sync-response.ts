import { SyncMutationResult } from '../../application/mutation-dispatcher.service';

/** Wire shape of the `SyncResponse` schema (contracts/openapi.yaml, CON-040). */
export interface SyncResponse {
  results: SyncMutationResult[];
}
