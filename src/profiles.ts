// Staalprofil for soylestubben over bunnplata.
// KUN for visualisering og IFC - profilen inngaar ikke i noen kapasitetskontroll,
// og bunnplata dimensjoneres ikke her. Godstykkelsen modelleres derfor ikke:
// hulprofiler tegnes massive, og HEA tegnes med nominell I-kontur slik at formen
// er gjenkjennelig. Maalene er nominelle ytterdimensjoner til uttegning.

import type { Geom } from "./model";

export type Family = "HEA" | "SHS" | "RHS" | "CHS";

export interface Profile {
  name: string; fam: Family;
  h: number;            // maal i profilens lokale y (sterk akse for HEA)
  b: number;            // maal i profilens lokale x
  tw?: number; tf?: number;  // kun HEA - trengs for at I-konturen skal bli en I
}

/** HEA etter EN 10365 - nominelle ytterdimensjoner [h, b, tw, tf]. */
const HEA: [number, number, number, number, number][] = [
  [100, 96, 100, 5, 8], [120, 114, 120, 5, 8], [140, 133, 140, 5.5, 8.5],
  [160, 152, 160, 6, 9], [180, 171, 180, 6, 9.5], [200, 190, 200, 6.5, 10],
  [220, 210, 220, 7, 11], [240, 230, 240, 7.5, 12], [260, 250, 260, 7.5, 12.5],
  [280, 270, 280, 8, 13], [300, 290, 300, 8.5, 14], [320, 310, 300, 9, 15.5],
  [340, 330, 300, 9.5, 16.5], [360, 350, 300, 10, 17.5], [400, 390, 300, 11, 19],
  [450, 440, 300, 11.5, 21], [500, 490, 300, 12, 23], [550, 540, 300, 12.5, 24],
  [600, 590, 300, 13, 25], [650, 640, 300, 13.5, 26], [700, 690, 300, 14.5, 27],
  [800, 790, 300, 15, 28], [900, 890, 300, 16, 30], [1000, 990, 300, 16.5, 31],
];
/** Kvadratiske hulprofiler - ytre sidekant. */
const SHS = [40, 50, 60, 70, 80, 90, 100, 110, 120, 140, 150, 160, 180, 200, 220,
  250, 260, 300, 350, 400];
/** Rektangulaere hulprofiler - [h, b]. */
const RHS: [number, number][] = [
  [50, 30], [60, 40], [80, 40], [90, 50], [100, 50], [100, 60], [120, 60],
  [120, 80], [140, 80], [150, 100], [160, 80], [180, 100], [200, 100],
  [200, 120], [250, 150], [300, 200], [400, 200],
];
/** Sirkulaere hulprofiler - ytre diameter. */
const CHS = [21.3, 26.9, 33.7, 42.4, 48.3, 60.3, 76.1, 88.9, 101.6, 114.3, 139.7,
  168.3, 193.7, 219.1, 244.5, 273, 323.9, 355.6, 406.4, 457, 508];

export const PROFILES: Record<string, Profile> = {};
for (const [n, h, b, tw, tf] of HEA)
  PROFILES[`HEA ${n}`] = { name: `HEA ${n}`, fam: "HEA", h, b, tw, tf };
for (const a of SHS)
  PROFILES[`SHS ${a}x${a}`] = { name: `SHS ${a}x${a}`, fam: "SHS", h: a, b: a };
for (const [h, b] of RHS)
  PROFILES[`RHS ${h}x${b}`] = { name: `RHS ${h}x${b}`, fam: "RHS", h, b };
for (const d of CHS)
  PROFILES[`CHS ${d}`] = { name: `CHS ${d}`, fam: "CHS", h: d, b: d };

export const PROFILE_NAMES = Object.keys(PROFILES);
export const DEFAULT_PROFILE = "HEA 200";

/** I-kontur mot klokka, 12 punkter, sentrert i origo. */
function hProfile(p: Profile): [number, number][] {
  const hy = p.h / 2, hx = p.b / 2, tw = (p.tw ?? 8) / 2, tf = p.tf ?? 12;
  return [
    [-hx, -hy], [hx, -hy], [hx, -hy + tf], [tw, -hy + tf], [tw, hy - tf],
    [hx, hy - tf], [hx, hy], [-hx, hy], [-hx, hy - tf], [-tw, hy - tf],
    [-tw, -hy + tf], [-hx, -hy + tf],
  ];
}

/**
 * Geometri for soylestubben. Lokal x er profilens b, lokal y er profilens h.
 * rot = 90 dreier profilet en kvart omdreining om egen akse (bytter x og y),
 * slik at HEA/RHS kan snus i forhold til skjaerretningen.
 * Verdensakser: x = ⊥V (paa tvers av ringmuren), y = ∥V (langs ringmuren).
 */
export function profileGeom(
  name: string, rot: number, cx: number, cy: number, z0: number, z1: number,
): Geom {
  const p = PROFILES[name] ?? PROFILES[DEFAULT_PROFILE];
  const swap = Math.round(rot) % 180 !== 0;
  if (p.fam === "CHS")
    return { kind: "sweep", radius: p.h / 2, path: [[cx, cy, z0], [cx, cy, z1]] };
  if (p.fam === "HEA") {
    const pts = hProfile(p).map(([x, y]) =>
      (swap ? [cx + y, cy + x] : [cx + x, cy + y]) as [number, number]);
    return { kind: "prism", profile: pts, z0, z1 };
  }
  // SHS/RHS: massiv ytterkontur (godstykkelse modelleres ikke)
  const [sx, sy] = swap ? [p.h, p.b] : [p.b, p.h];
  return { kind: "box", size: [sx, sy, z1 - z0], center: [cx, cy, (z0 + z1) / 2] };
}
