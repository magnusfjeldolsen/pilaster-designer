// 2D-snitt og plan som SVG-streng. Samme inndata og samme geometrimodell som 3D-visningen,
// slik at plasseringen av pilasteren i ringmuren er identisk i begge visningene.

import type { Inputs, Results } from "./calc";
import { pilasterOffsetX } from "./model";

export type Mech = "shear" | "split" | "axial" | "lap";

export const MECHS: { id: Mech; label: string; color: string }[] = [
  { id: "shear", label: "Skjær (fagverk)", color: "#2a78d6" },
  { id: "split", label: "Spaltestrekk (mutter)", color: "#eb6834" },
  { id: "axial", label: "Aksialforankring", color: "#1baf7a" },
  { id: "lap", label: "Omfaring / innstøping", color: "#4a3aa7" },
];

export const MECH_TEXT: Record<Mech, string> = {
  shear: `<b>Skjær — fagverksmodell (§7.2.2).</b> <i>V</i> henger i bøylene med arm <i>e_s</i> over indre arm
    <i>z ≈ 0,9·d</i>. Bøylestrekk <i>N_Ed,re = V·(1+e_s/z)</i>. Med <b>skjærnokk</b> tas V som betongtrykk
    foran nokken på projisert areal, og armen reduseres til <i>e_s* = t_grout+h_emb/2</i>.`,
  split: `<b>Spaltestrekk fra endeforankring (§6.5/§6.7).</b> Endetrykket sprer seg <i>θ°</i> ut i betongen;
    tverrkomponenten er spaltestrekk som <b>bøylene</b> tar: <i>T = ¼(1−a₁/a)·N</i>. Ankerplate gir større
    a₁ ⇒ mindre spaltestrekk.`,
  axial: `<b>Aksialforankring — oppstikk (§8.4).</b> Aksialstrekket føres <b>ikke</b> av bøylene, men av de
    oppstikkende jernene fra såla (grønn), ned i fundamentet. <i>N_Rd,v ≈ n·A·f_yd</i>.`,
  lap: `<b>Omfaring &amp; innstøping (§8.7).</b> Stagkraften overføres til oppstikkene via omfaring <i>l₀</i>.
    Endetrykket må spres <i>e_h/tan θ</i> ut til jernene ⇒ innstøping <i>h_ef,nødv ≈ e_h/tan θ + l₀ + c</i>.`,
};

const C = {
  ink: "#0b0b0b", ink2: "#52514e", ink3: "#8a897f", line: "#d9d9d2",
  s1: "#fcfcfb", s2: "#eeeeea", acc: "#2a78d6", crit: "#d03b3b",
  shear: "#2a78d6", split: "#eb6834", axial: "#1baf7a", lap: "#4a3aa7",
};

// --- små SVG-hjelpere (streng-basert -> lett å skrive ut og teste) ---
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = "none", sw = 1,
  extra = "") =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" ` +
  `height="${Math.max(0, h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const ln = (x1: number, y1: number, x2: number, y2: number, st: string, w = 1, dash = "") =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
  `stroke="${st}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const circ = (x: number, y: number, r: number, fill: string, stroke = "none", sw = 1) =>
  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(0.5, r).toFixed(1)}" ` +
  `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const tx = (x: number, y: number, s: string, fill = C.ink2, size = 11, anchor = "middle", weight = "") =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${size}" ` +
  `text-anchor="${anchor}" font-family="-apple-system,Segoe UI,Roboto,Arial,sans-serif"` +
  `${weight ? ` font-weight="${weight}"` : ""}>${esc(s)}</text>`;

function arrow(x1: number, y1: number, x2: number, y2: number, col: string, w = 2): string {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 6;
  return ln(x1, y1, x2, y2, col, w) +
    ln(x2, y2, x2 - h * Math.cos(a - 0.5), y2 - h * Math.sin(a - 0.5), col, w) +
    ln(x2, y2, x2 - h * Math.cos(a + 0.5), y2 - h * Math.sin(a + 0.5), col, w);
}
function dim(x1: number, y1: number, x2: number, y2: number, label: string, col = C.ink3,
  horiz = false): string {
  return ln(x1, y1, x2, y2, col, 1, "2 2") +
    tx((x1 + x2) / 2 + (horiz ? 0 : 6), (y1 + y2) / 2 + (horiz ? -4 : 0), label, col, 10,
      horiz ? "middle" : "start");
}
const svg = (w: number, h: number, body: string, title: string) =>
  `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" ` +
  `aria-label="${esc(title)}">${body}</svg>`;

/* ------------------------------------------------------------------ *
 * PLAN — viser pilasterens plassering i ringmuren (ensidig/sentrisk)  *
 * ------------------------------------------------------------------ */
export function drawPlan(v: Inputs, R: Results, mech: Mech): string {
  const W = 560, cx = W / 2, yTop = 70;
  const x0 = pilasterOffsetX(v);
  // Verdensakser: X = paa tvers av ringmuren (mal b) -> skjerm-Y (nedover)
  //               Y = langs ringmuren = skjaerretning V (mal h) -> skjerm-X (hoyre)
  const xLo = Math.min(-v.t_wall / 2, x0 - v.b / 2);
  const xHi = Math.max(v.t_wall / 2, x0 + v.b / 2);
  // Skalaen bestemmes av TVERRSNITTSMAALENE alene. Tidligere ble den tilpasset
  // (xHi - xLo), som vokser med e_p - da krympet pilasteren paa skjermen naar
  // eksentrisiteten oekte, som om selve soylen ble mindre. Tegneflaten vokser
  // i stedet nedover slik at eksentrisiteten faar plass.
  const sc = Math.min(170 / Math.max(v.b, v.t_wall, 1), 190 / Math.max(v.h, 1), 0.5);
  const H = Math.ceil(Math.max(340, yTop + (xHi - xLo) * sc + 95));
  const sy = (wx: number) => yTop + (wx - xLo) * sc;   // verdens-X -> skjerm-Y
  const sxx = (wy: number) => cx + wy * sc;            // verdens-Y -> skjerm-X

  const wallT = sy(-v.t_wall / 2), wallB = sy(v.t_wall / 2);
  const pilT = sy(x0 - v.b / 2), pilB = sy(x0 + v.b / 2);
  const pL = sxx(-v.h / 2), pR = sxx(v.h / 2);
  const out: string[] = [];

  // ringmur i full bredde
  out.push(rect(24, wallT, W - 48, wallB - wallT, C.s2, C.ink3, 1));
  out.push(tx(62, wallT + 13, "RINGMUR", C.ink3, 10));
  // pilaster
  out.push(rect(pL, pilT, pR - pL, pilB - pilT, C.s1, C.ink, 1.6));
  out.push(tx(pL + 2, pilB + 14, "PILASTER", C.ink2, 10, "start"));

  out.push(ln(24, sy(0), W - 24, sy(0), C.ink3, 0.8, "6 4"));
  out.push(tx(W - 28, sy(0) - 5, "senterlinje ringmur", C.ink3, 9, "end"));

  // e_p: senterlinje ringmur -> senterlinje pilaster
  const pcy0 = (pilT + pilB) / 2, xe = pL - 34;
  if (Math.abs(x0) > 0.5) {
    out.push(ln(xe - 10, sy(0), pL - 2, sy(0), C.crit, 0.8, "3 3"));
    out.push(ln(xe - 10, pcy0, pL - 2, pcy0, C.crit, 0.8, "3 3"));
    out.push(arrow(xe, sy(0), xe, pcy0, C.crit, 1.4));
    out.push(tx(xe - 5, (sy(0) + pcy0) / 2 + 4, `e_p = ${x0.toFixed(0)}`, C.crit, 10, "end", "700"));
  } else {
    out.push(tx(pL - 12, pcy0 + 4, "e_p = 0 (sentrisk)", C.ink3, 9, "end"));
  }

  // utstikk forbi murflaten paa positiv side (kan vaere negativ = innenfor murlivet)
  const proj = x0 + v.b / 2 - v.t_wall / 2;
  if (proj > 0.5) {
    out.push(ln(pR + 40, wallB, pR + 40, pilB, C.crit, 1, "3 3"));
    out.push(arrow(pR + 40, wallB, pR + 40, pilB, C.crit, 1.4));
    out.push(tx(pR + 46, (wallB + pilB) / 2 + 4,
      `utstikk ${proj.toFixed(0)} mm`, C.crit, 10, "start", "700"));
  } else {
    out.push(tx(pR + 16, pilB + 6,
      `ingen utstikk (${proj.toFixed(0)} mm)`, C.ink3, 9, "start"));
  }

  // bøyle
  const cov = Math.max(6, v.c_nom * sc);
  const bxL = pL + cov, bxR = pR - cov, byT = pilT + cov, byB = pilB - cov;
  const boyleCol = mech === "axial" ? C.ink3 : C.acc;
  out.push(rect(bxL, byT, bxR - bxL, byB - byT, "none", boyleCol,
    mech === "shear" || mech === "split" ? 2.8 : 2, `rx="11" ry="11"`));
  out.push(tx(pL - 6, byB + 4, `bøyle Ø${v.phi_b.toFixed(0)}`, boyleCol, 10, "end"));

  // Armering og stag tegnes fra SAMME moenstre som beregningen og 3D-modellen bruker.
  // Moensterkoordinatene er [⊥V, ∥V] om pilastersenteret -> verdens (x0 + px, py).
  const toScreen = ([px, py]: [number, number]): [number, number] => [sxx(py), sy(x0 + px)];
  const midY = (byT + byB) / 2;
  const rv = Math.max(3, v.phi_v * sc * 0.9);
  const axHi = mech === "axial";
  const barPts = R.barXY.map(toScreen);
  for (const [x, y] of barPts)
    out.push(circ(x, y, rv, axHi ? C.axial : C.s1, axHi ? C.axial : C.ink, 1.8));
  out.push(ln(bxR, byT, bxR + 30, byT - 20, axHi ? C.axial : C.ink3, 1));
  out.push(tx(bxR + 34, byT - 22, `${R.n_v_eff}Ø${v.phi_v.toFixed(0)}`, axHi ? C.axial : C.ink,
    11, "start", "700"));

  // gjengestag
  const rb = Math.max(3, R.d_bolt / 2 * sc);
  const pcx = (pL + pR) / 2, pcy = (pilT + pilB) / 2;
  const boltPts = R.boltXY.map(toScreen);
  if (R.isPlate) {
    const wpl = Math.max(6, v.a_anch * sc);
    for (const [x, y] of boltPts)
      out.push(rect(x - wpl / 2, y - wpl / 2, wpl, wpl, "none", C.ink3, 1, `stroke-dasharray="3 2"`));
  }
  for (const [x, y] of boltPts) {
    out.push(circ(x, y, rb, C.ink));
    out.push(circ(x, y, rb + 2.5, "none", C.ink, 1));
  }
  out.push(tx(pL - 6, byT + 4, `${R.boltXY.length}×${v.boltsize}`, C.ink2, 10, "end"));
  // s_bolt maales mellom to nabostag i moensteret
  const sb = Math.max(...boltPts.map(([x]) => Math.abs(x - pcx)), 1);
  if (R.boltXY.length > 1)
    out.push(dim(pcx - sb, pilT - 9, pcx + sb, pilT - 9, "s_bolt", C.ink3, true));

  // laster: N inn i planet, V langs X (nedover på skjermen = ∥ skjærretning)
  out.push(circ(pcx, pcy, 9, C.s1, C.acc, 2));
  out.push(ln(pcx - 6.4, pcy - 6.4, pcx + 6.4, pcy + 6.4, C.acc, 2));
  out.push(ln(pcx - 6.4, pcy + 6.4, pcx + 6.4, pcy - 6.4, C.acc, 2));
  out.push(tx(pcx + 13, pcy - 11, "N", C.acc, 12, "start", "700"));
  // V virker PARALLELT med ringmuren -> langs skjerm-X
  const vCol = mech === "shear" ? C.shear : C.acc;
  out.push(arrow(pcx, pcy, pcx + 52, pcy, vCol, mech === "shear" ? 3 : 2));
  out.push(tx(pcx + 57, pcy + 4, "V", vCol, 12, "start", "700"));
  out.push(tx(pcx + 57, pcy + 17, "∥ ringmur", vCol, 9, "start"));

  if (mech === "shear") out.push(dim(bxL, midY + 18, bxR, midY + 18, "z ≈ 0,9·d", C.shear, true));
  if (mech === "lap" || mech === "split")
    out.push(dim(pcx + sb, byB + 22, bxR, byB + 22, "e_h", C.lap, true)); // klar av jern-sirklene
  if (mech === "split")
    for (const [x, y] of boltPts)
      out.push(arrow(x, y, x + (x < pcx ? -1 : 1) * Math.max(10, bxR - pcx - 8), y, C.split, 1.6));

  out.push(tx(cx, 22, "PLAN — pilaster i ringmur", C.ink, 12, "middle", "700"));
  out.push(tx(cx, 38,
    `h = ${v.h.toFixed(0)} (∥V, langs mur) · b = ${v.b.toFixed(0)} (⊥V, på tvers) · ` +
    `t_wall = ${v.t_wall.toFixed(0)} mm`, C.ink3, 10));
  return svg(W, H, out.join(""), "Plan av pilaster i ringmur");
}

/* ------------------------------------------------------------------ *
 * SNITT — mekanismer: bøylelag, stag, oppstikk, omfaring             *
 * ------------------------------------------------------------------ */
export function drawSection(v: Inputs, R: Results, mech: Mech): string {
  const W = 560, H = 440, cx = W * 0.5, top = 112;
  const Hmax = Math.max(v.H_pil, v.H_wall, 1), s = Math.min(250 / Hmax, 0.5);
  const pilBot = top + v.H_pil * s, wallBot = top + v.H_wall * s;
  const foot = Math.max(pilBot, wallBot), footB = foot + 26;
  // vannrett akse = langs ringmuren = skjaerretningen, dvs. pilastermaalet h (∥V)
  const pxB = Math.max(120, Math.min(210, v.h * 0.42)), L = cx - pxB / 2, Rr = cx + pxB / 2;
  const out: string[] = [];

  out.push(tx(36, 22, "SNITT — langs ringmur", C.ink, 12, "start", "700"));
  out.push(tx(36, 38, MECHS.find((m) => m.id === mech)!.label,
    MECHS.find((m) => m.id === mech)!.color, 10, "start", "700"));

  // såle
  out.push(rect(36, foot, W - 72, footB - foot, C.s2, C.ink3, 1));
  for (let x = 44; x < W - 44; x += 13) out.push(ln(x, footB, x + 8, foot, C.ink3, 0.7));
  out.push(tx(W - 44, foot + 17, "SÅLE", C.ink3, 10, "end"));
  // ringmurstubber
  out.push(rect(36, top, L - 36, wallBot - top, C.s2, C.ink3, 1));
  out.push(rect(Rr, top, W - 36 - Rr, wallBot - top, C.s2, C.ink3, 1));
  out.push(tx(66, top + 14, "RINGMUR", C.ink3, 10));
  out.push(ln(36, top, W - 36, top, C.ink3, 1, "3 3"));
  out.push(tx(W - 44, top - 6, "OK pilaster = OK ringmur", C.ink3, 9, "end"));
  // pilaster
  out.push(rect(L, top, pxB, pilBot - top, C.s1, C.ink, 1.6));
  out.push(tx(cx, pilBot - 7, "PILASTER", C.ink2, 10));

  // bunnplate + søylestubbe + laster
  const pw = Math.max(80, Math.min(pxB + 40, v.a1p * 0.42));
  out.push(rect(cx - pw / 2, top - 9, pw, 9, C.ink3));
  out.push(rect(cx - 15, top - 42, 30, 33, "none", C.ink, 1.6));
  out.push(arrow(cx, top - 68, cx, top - 44, C.acc, 2));
  out.push(tx(cx - 9, top - 54, "N", C.acc, 12, "end", "700"));
  out.push(arrow(cx + 25, top - 25, cx + 55, top - 25, C.acc, 2));
  out.push(tx(cx + 59, top - 21, "V", C.acc, 12, "start", "700"));

  // stag / oppstikk-geometri
  const bx = Math.max(15, Math.min(pxB * 0.2, v.s_bolt * 0.42 / 2));
  const boltL = cx - bx, boltR = cx + bx;
  const nutY = Math.min(pilBot - 14, top + v.h_ef * s);
  const ehpx = Math.max(12, Math.min(pxB * 0.3, R.e_h * 0.42));
  const barL = Math.max(L + 6, boltL - ehpx), barR = Math.min(Rr - 6, boltR + ehpx);

  // effektiv sone + bøylelag
  const zTop = top + Math.max(6, v.c_nom * s);
  const zBot = Math.min(pilBot - 4, zTop + R.h_sone * s);
  const step = Math.max(6, v.s_b * s);
  out.push(rect(L + 2, zTop, pxB - 4, zBot - zTop, C.shear, "none", 0, `opacity="0.08"`));
  let s1: number | null = null, s2: number | null = null, cnt = 0;
  for (let y = zTop; y <= zBot + 0.5 && cnt < R.n_lag; y += step) {
    out.push(ln(barL - 2, y, barR + 2, y, mech === "axial" ? C.ink3 : C.shear,
      mech === "axial" ? 1 : 1.8));
    if (s1 === null) s1 = y; else if (s2 === null) s2 = y;
    cnt++;
  }
  // plasseres lavt slik at de ikke kolliderer med trykkstav-teksten (samme hoyre marg)
  out.push(tx(Rr + 5, zTop + 92, "effektiv sone", C.ink2, 9, "start"));
  out.push(tx(Rr + 5, zTop + 104, `${R.n_lag.toFixed(0)} bøylelag`,
    mech === "axial" ? C.ink3 : C.shear, 10, "start", "700"));
  if (s1 !== null && s2 !== null) out.push(dim(barR + 2, s1, barR + 2, s2, "s_b"));

  // stag + endeforankring (plate / sekskantmutter / ingen)
  for (const x of [boltL, boltR]) {
    out.push(ln(x, top - 2, x, nutY, C.ink, 2.4));
    if (R.isPlate) {
      const wpl = Math.max(10, v.a_anch * 0.42);
      out.push(rect(x - wpl / 2, nutY, wpl, Math.max(5, v.t_pl * 0.3), C.ink));
    } else if (R.isNut) {
      // mutter i oppriss: noekkelvidde 1,5d bred, 0,8d hoy, med fasede hjoerner
      const wn = Math.max(9, R.a_nut * 0.42), hn = Math.max(5, 0.8 * R.d_bolt * 0.42), ch = hn * 0.22;
      out.push(`<polygon points="${[
        [x - wn / 2, nutY + ch], [x - wn / 2 + ch, nutY], [x + wn / 2 - ch, nutY],
        [x + wn / 2, nutY + ch], [x + wn / 2, nutY + hn - ch], [x + wn / 2 - ch, nutY + hn],
        [x - wn / 2 + ch, nutY + hn], [x - wn / 2, nutY + hn - ch],
      ].map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ")}" fill="${C.ink}"/>`);
    }
  }
  out.push(tx(boltL - 6, top + 30, v.boltsize, C.ink2, 10, "end"));
  out.push(tx(cx, nutY + 16,
    R.isPlate ? "ankerplate" : R.isNut ? `endemutter (nv ${R.a_nut.toFixed(0)})`
      : "ingen endeforankring — heft §8.4", C.ink2, 9));
  if (R.noAnchor)
    out.push(tx(cx, nutY + 28, `l_bd = ${R.bond.lbd.toFixed(0)} mm`,
      R.u_bond <= 1 ? C.axial : C.crit, 9, "middle", "700"));
  for (const x of [barL, barR]) out.push(ln(x, foot - 4, x, top + 22, C.axial, 2.2));
  out.push(dim(boltL, top + 6, boltR, top + 6, "s_bolt", C.ink3, true));

  // skjærnokk
  const lgy = top + Math.max(4, v.t_grout * s);
  // nokken sees PAA KANT i dette snittet (bredden w_lug staar vinkelrett paa V)
  const lw = 12, le = Math.max(14, v.h_emb * s);
  if (R.use_lug) {
    out.push(rect(cx - lw / 2, lgy, lw, le, C.ink3, C.ink, 1.4));
    out.push(tx(cx, lgy + le + 11, "skjærnokk (på kant)", C.ink2, 9));
  }

  // mekanisme-overlegg
  if (mech === "shear") {
    if (R.use_lug) {
      for (const i of [1, 2, 3])
        out.push(arrow(cx + lw / 2 + 22, lgy + le * i / 4, cx + lw / 2 + 2, lgy + le * i / 4, C.shear, 2));
      out.push(tx(cx + lw / 2 + 26, lgy + le / 2, "betongtrykk", C.shear, 9, "start"));
    } else {
      out.push(ln(cx, top + 2, barR, nutY, C.split, 2.2, "6 5"));
      out.push(tx(barR + 2, (top + nutY) / 2, "trykkstav", C.split, 9, "start"));
    }
    const yTie = R.use_lug ? lgy + le : nutY;
    out.push(arrow(barR + 2, yTie, barL - 2, yTie, C.shear, 3));
    out.push(arrow(barL - 2, yTie, barR + 2, yTie, C.shear, 3));
    out.push(tx(cx, yTie - 6, "bøylestrekk", C.shear, 10));
  }
  if (mech === "split") {
    for (const [bxx, barx] of [[boltL, barL], [boltR, barR]])
      out.push(ln(bxx, nutY, barx, nutY - Math.min(80, R.l_spread * s), C.split, 2, "5 4"));
    out.push(arrow(barR, nutY - 5, barL, nutY - 5, C.split, 3));
    out.push(arrow(barL, nutY - 5, barR, nutY - 5, C.split, 3));
    out.push(tx(cx, nutY - 12, "spaltestrekk T (bøyle)", C.split, 10));
    out.push(tx(cx, nutY + 26, `θ = ${v.theta.toFixed(0)}° spredning`, C.split, 10));
  }
  if (mech === "axial") {
    for (const x of [boltL, boltR]) out.push(arrow(x, nutY - 6, x, top + 2, C.axial, 2.2));
    for (const x of [barL, barR]) out.push(arrow(x, top + 22, x, foot - 6, C.axial, 2.6));
    out.push(tx(cx, foot - 4, `strekk → ned i såla via ${v.n_v}Ø${v.phi_v.toFixed(0)}`, C.axial, 10));
  }
  if (mech === "lap") {
    out.push(dim(boltR, nutY + 22, barR, nutY + 22, "e_h", C.lap, true));
    const lapTop = Math.max(top + 22, nutY - Math.min(80, R.l_spread * s));
    const lapBot = Math.min(foot - 6, lapTop + Math.max(40, R.l0 * s));
    out.push(ln(boltR, nutY, barR, lapTop, C.lap, 2, "5 4"));
    out.push(rect(barR + 5, lapTop, 6, lapBot - lapTop, C.lap, "none", 0, `opacity="0.6"`));
    out.push(tx(barR + 14, (lapTop + lapBot) / 2, "l₀", C.lap, 11, "start", "700"));
    out.push(dim(L - 12, top, L - 12, nutY, "h_ef"));
    out.push(tx(cx, nutY + 42, `h_ef,nødv/h_ef = ${R.u_emb.toFixed(2)}`,
      R.u_emb <= 1 ? C.axial : C.crit, 10));
  }
  out.push(tx(W - 40, top + 30, R.govA ? "dim: strekk+skjær" : "dim: trykk+skjær", C.ink2, 10, "end"));
  return svg(W, H, out.join(""), "Snitt gjennom pilaster");
}
