// pnpm maps:validate - checks every registered map against the schema and spec 8.1.
import { MapError, resolveMap } from '@monopoli/engine';
import { MAP_IDS, RAW_MAPS } from '@monopoli/maps';

let failed = 0;
for (const id of MAP_IDS) {
  try {
    const map = resolveMap(RAW_MAPS[id]);
    if (map.id !== id) throw new MapError(`Map registered as "${id}"`, [`its id is "${map.id}"`]);
    console.log(
      `✓ ${id}: ${map.tiles.length} tiles, ${Object.keys(map.cards).length} cards, ${map.currency.code}`,
    );
  } catch (e) {
    failed++;
    console.error(`✗ ${id}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
if (failed > 0) process.exit(1);
