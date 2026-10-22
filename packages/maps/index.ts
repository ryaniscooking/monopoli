// Map registry: raw map data, validated by the engine at load time (parseMap).
// Adding a map = adding <id>/map.json and registering it here. No engine or UI changes.
import dubai from './dubai/map.json';
import myanmar from './myanmar/map.json';

export const RAW_MAPS: Readonly<Record<string, unknown>> = { myanmar, dubai };

export const MAP_IDS: readonly string[] = Object.keys(RAW_MAPS);
