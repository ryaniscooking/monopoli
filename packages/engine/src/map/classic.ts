// Appendix A: classic economy table (classic units; scaled by the map multiplier at load).

export interface ClassicProperty {
  price: number;
  rent: readonly [number, number, number, number, number, number]; // base, 1-4 houses, hotel
  houseCost: number;
  mortgage: number;
}

// Index 0 = slot p01.
export const CLASSIC_PROPERTIES: readonly ClassicProperty[] = [
  { price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, mortgage: 30 },
  { price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50, mortgage: 30 },
  { price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50 },
  { price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50 },
  { price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50, mortgage: 60 },
  { price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70 },
  { price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70 },
  { price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100, mortgage: 80 },
  { price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90 },
  { price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90 },
  { price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, mortgage: 100 },
  { price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110 },
  { price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110 },
  { price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, mortgage: 120 },
  { price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130 },
  { price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130 },
  { price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150, mortgage: 140 },
  { price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, mortgage: 160 },
  { price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, mortgage: 175 },
  { price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, mortgage: 200 },
];

export const CLASSIC_TRANSPORT = { price: 200, mortgage: 100, rent: [25, 50, 100, 200] } as const;
export const CLASSIC_UTILITY = { price: 150, mortgage: 75, multipliers: [4, 10] } as const;
export const CLASSIC_BANK = { houses: 32, hotels: 12 } as const;

/** Spec 8.2: expected tile at each board index, shared by all maps. */
// prettier-ignore
export const BOARD_LAYOUT: readonly string[] = [
  'go', 'p01', 'chest', 'p02', 'tax', 't1', 'p03', 'chance', 'p04', 'p05',
  'jail', 'p06', 'u1', 'p07', 'p08', 't2', 'p09', 'chest', 'p10', 'p11',
  'parking', 'p12', 'chance', 'p13', 'p14', 't3', 'p15', 'p16', 'u2', 'p17',
  'gotojail', 'p18', 'p19', 'chest', 'p20', 't4', 'chance', 'p21', 'tax', 'p22',
];

// prettier-ignore
export const GROUP_BY_SLOT: readonly string[] = [
  'brown', 'brown', 'lightblue', 'lightblue', 'lightblue', 'pink', 'pink', 'pink',
  'orange', 'orange', 'orange', 'red', 'red', 'red', 'yellow', 'yellow', 'yellow',
  'green', 'green', 'green', 'darkblue', 'darkblue',
];

export const JAIL_INDEX = 10;
export const BOARD_SIZE = 40;
