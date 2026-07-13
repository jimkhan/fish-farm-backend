import { SpeciesCategory } from '../../ponds/domain/species.entity';
import { FeedType } from '../../inventory/domain/inventory-item.entity';

/**
 * F3 (TASK-021, MOD-05 R4, GLOSSARY §2 "Feed type"): floating = FISH (Carp/Parse/Grass Carp),
 * sinking = PRAWN (Golda) — the only two `Species.category` values seeded (TASK-018), and the
 * only signal available to derive a batch's feed type from (inventory items carry their own
 * owner-assigned `feedType`, TASK-020, but that's a project's stock configuration, not a
 * species-derived fact). `NURSERY_DUST` (starter feed for fry) has no species-category signal to
 * derive it from and is never returned here — a documented gap, not a bug: no AC in this task
 * exercises it.
 */
export function feedTypeForSpeciesCategory(category: SpeciesCategory): FeedType {
  return category === 'PRAWN' ? 'SINKING' : 'FLOATING';
}
