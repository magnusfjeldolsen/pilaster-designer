// Felles geometrimodell: bygger en liste ElementSpec fra input + beregning.
// Konsumeres BADE av three.js-visningen og IFC-eksporten -> ett sannhetsgrunnlag.
// Koordinater i mm. Z opp. OK betong = z=0 (betong gaar nedover, negativ z).
// X = skjaerretning (V), Y = tverretning.

import type { Inputs, Results } from "./calc";

export type Vec3 = [number, number, number];

export type Geom =
  | { kind: "box"; size: Vec3; center: Vec3 }            // aksejustert kasse
  | { kind: "sweep"; radius: number; path: Vec3[] };      // sirkulaer disk sveipet langs polylinje

export interface ElementSpec {
  id: string;
  name: string;
  ifcClass:
    | "IfcColumn" | "IfcWall" | "IfcFooting" | "IfcPlate" | "IfcMember"
    | "IfcReinforcingBar" | "IfcMechanicalFastener";
  material: "concrete" | "rebar-stirrup" | "rebar-bar" | "steel" | "bolt" | "lug";
  color: number;      // three.js hex
  rgb: Vec3;          // IFC 0..1
  opacity: number;
  geom: Geom;
}

const COL = {
  concrete: { hex: 0xb8b4a8, rgb: [0.72, 0.70, 0.66] as Vec3, op: 0.30 },
  wall: { hex: 0xc7c3b6, rgb: [0.78, 0.76, 0.71] as Vec3, op: 0.22 },
  footing: { hex: 0xa9a598, rgb: [0.66, 0.65, 0.60] as Vec3, op: 0.28 },
  stirrup: { hex: 0x2a78d6, rgb: [0.16, 0.47, 0.84] as Vec3, op: 1 },
  bar: { hex: 0x1baf7a, rgb: [0.10, 0.69, 0.48] as Vec3, op: 1 },
  steel: { hex: 0x8a8f98, rgb: [0.54, 0.56, 0.60] as Vec3, op: 1 },
  bolt: { hex: 0x55585e, rgb: [0.33, 0.35, 0.37] as Vec3, op: 1 },
  lug: { hex: 0xd95926, rgb: [0.85, 0.35, 0.15] as Vec3, op: 1 },
};

// Åpen bøyle med avrundede hjørner og liten krok-åpning på midt-høyre kant.
// Åpen directrix (som en reell bøyle) -> swept-disk fungerer i alle geometrikjerner (OCC m.fl.).
function roundedRect(hx: number, hy: number, z: number, rb: number, k = 6): Vec3[] {
  rb = Math.min(rb, hx * 0.6, hy * 0.6);
  const gh = Math.max(rb * 0.4, 8);            // halv åpning ved krok
  const arcs = [
    { cx: hx - rb, cy: hy - rb, a0: 0, a1: 90 },
    { cx: -hx + rb, cy: hy - rb, a0: 90, a1: 180 },
    { cx: -hx + rb, cy: -hy + rb, a0: 180, a1: 270 },
    { cx: hx - rb, cy: -hy + rb, a0: 270, a1: 360 },
  ];
  const pts: Vec3[] = [[hx, gh, z]];           // start rett over midt-høyre
  for (const a of arcs)
    for (let j = 0; j <= k; j++) {
      const t = (a.a0 + (a.a1 - a.a0) * j / k) * Math.PI / 180;
      pts.push([a.cx + rb * Math.cos(t), a.cy + rb * Math.sin(t), z]);
    }
  pts.push([hx, -gh, z]);                       // slutt rett under midt-høyre (liten åpning)
  return pts;
}

export function buildModel(v: Inputs, R: Results): ElementSpec[] {
  const els: ElementSpec[] = [];
  const hx = v.h / 2, hy = v.b / 2;           // pilaster half dims (X=h, Y=b)
  const Lw = Math.max(3 * v.b, v.b + 2 * v.t_wall + 400); // ringmur-lengde (Y)
  const tFoot = 400;
  const tbp = 25;                              // bunnplatetykkelse
  const sx = v.s_bolt / 2, sy = v.s_bolt / 2;  // boltmonster (kvadrat)
  const cS = v.c_nom + v.phi_b / 2;            // boyle-senterlinje innrykk
  const cV = v.c_nom + v.phi_b + v.phi_v / 2;  // oppstikk-senterlinje innrykk

  const push = (
    id: string, name: string, ifcClass: ElementSpec["ifcClass"],
    key: keyof typeof COL, geom: Geom
  ) => {
    const c = COL[key];
    const mat: ElementSpec["material"] =
      key === "concrete" || key === "wall" || key === "footing" ? "concrete"
      : key === "stirrup" ? "rebar-stirrup" : key === "bar" ? "rebar-bar"
      : key === "bolt" ? "bolt" : key === "lug" ? "lug" : "steel";
    els.push({ id, name, ifcClass, material: mat, color: c.hex, rgb: c.rgb, opacity: c.op, geom });
  };

  // ---- Betong ----
  push("footing", "Sale", "IfcFooting", "footing",
    { kind: "box", size: [v.h + 600, Lw, tFoot], center: [0, 0, -v.H_pil - tFoot / 2] });
  push("ringwall", "Ringmur", "IfcWall", "wall",
    { kind: "box", size: [v.t_wall, Lw, v.H_wall], center: [0, 0, -v.H_wall / 2] });
  push("pilaster", "Pilaster", "IfcColumn", "concrete",
    { kind: "box", size: [v.h, v.b, v.H_pil], center: [0, 0, -v.H_pil / 2] });

  // ---- Stal: bunnplate + soylestubbe ----
  push("baseplate", "Bunnplate stalsoyle", "IfcPlate", "steel",
    { kind: "box", size: [v.a1p, v.a1p, tbp], center: [0, 0, tbp / 2] });
  push("colstub", "Stalsoyle (stubbe)", "IfcMember", "steel",
    { kind: "box", size: [v.h * 0.45, v.b * 0.45, 300], center: [0, 0, tbp + 150] });

  // ---- Gjengestag (4x) ----
  const rodTop = tbp + 40, rodBot = -v.h_ef;
  const boltXY: Vec3[] = [[sx, sy, 0], [-sx, sy, 0], [sx, -sy, 0], [-sx, -sy, 0]];
  boltXY.forEach(([x, y], i) =>
    push(`rod${i}`, `Gjengestag ${v.boltsize} #${i + 1}`, "IfcMechanicalFastener", "bolt",
      { kind: "sweep", radius: R.d_bolt / 2, path: [[x, y, rodTop], [x, y, rodBot]] }));

  // ---- Endeforankring (plate eller mutter) per stag ----
  boltXY.forEach(([x, y], i) => {
    if (R.isPlate)
      push(`aplate${i}`, `Ankerplate #${i + 1}`, "IfcPlate", "steel",
        { kind: "box", size: [v.a_anch, v.a_anch, v.t_pl], center: [x, y, rodBot + v.t_pl / 2] });
    else
      push(`nut${i}`, `Endemutter #${i + 1}`, "IfcMechanicalFastener", "steel",
        { kind: "box", size: [v.a_anch, v.a_anch, 18], center: [x, y, rodBot + 9] });
  });

  // ---- Oppstikkende jern 8xO25 (hjorner + midt) ----
  const bxr = hx - cV, byr = hy - cV;
  const barXY = ([
    [bxr, byr, 0], [-bxr, byr, 0], [bxr, -byr, 0], [-bxr, -byr, 0],
    [bxr, 0, 0], [-bxr, 0, 0], [0, byr, 0], [0, -byr, 0],
  ] as Vec3[]).slice(0, v.n_v);
  const barTop = -(v.c_nom + v.phi_b + v.phi_v / 2), barBot = -v.H_pil - 150;
  barXY.forEach(([x, y], i) =>
    push(`bar${i}`, `Oppstikk O${v.phi_v} #${i + 1}`, "IfcReinforcingBar", "bar",
      { kind: "sweep", radius: v.phi_v / 2, path: [[x, y, barTop], [x, y, barBot]] }));

  // ---- Boyler (n_lag lukkede rektangler i effektiv sone) ----
  const rxx = hx - cS, ryy = hy - cS;
  for (let k = 0; k < R.n_lag; k++) {
    const z = -(v.c_nom + v.phi_b / 2) - k * v.s_b;
    if (z < -v.H_pil + 10) break;
    const rb = Math.max(2 * v.phi_b, 15);   // bøyeradius (mandrel)
    push(`stirrup${k}`, `Boyle O${v.phi_b} #${k + 1}`, "IfcReinforcingBar", "stirrup",
      { kind: "sweep", radius: v.phi_b / 2, path: roundedRect(rxx, ryy, z, rb) });
  }

  // ---- Skjaernokk ----
  if (v.use_lug)
    push("lug", "Skjaernokk", "IfcPlate", "lug",
      { kind: "box", size: [20, v.w_lug, v.h_emb + v.t_grout], center: [0, 0, -(v.h_emb + v.t_grout) / 2] });

  return els;
}
