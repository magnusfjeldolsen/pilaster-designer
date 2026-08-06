// Beregningsmodul (NS-EN 1992-4) - portert fra regnearket.
// Ren funksjon: Inputs -> Results. Ingen DOM-avhengighet.

import { profileContains, profileExtent } from "./profiles";

/** Endeforankring av gjengestaget.
 *  "ingen"  - staget er ikke endeforankret; strekket maa forankres ved heft (§8.4)
 *  "mutter" - sekskantmutter, noekkelvidde ~1,5*d (ISO 4032), hoyde ~0,8*d
 *  "plate"  - kvadratisk ankerplate med side a_anch og tykkelse t_pl */
export type AnchorKind = "ingen" | "mutter" | "plate";

/** Faktor for stangdiameter, NS-EN 1992-1-1 §8.4.2 (2). */
export const eta2Of = (phi: number) => (phi <= 32 ? 1 : (132 - phi) / 100);

/** Betongens fasthetsegenskaper avledet av f_ck etter NS-EN 1992-1-1 tabell 3.1.
 *  Ingen av disse skal legges inn manuelt - de foelger entydig av fasthetsklassen. */
export interface ConcreteProps {
  fcm: number;      // middelverdi trykkfasthet     = f_ck + 8
  fctm: number;     // middelverdi strekkfasthet
  fctk005: number;  // 5 %-fraktil strekkfasthet    = 0,7*f_ctm
  fctk095: number;  // 95 %-fraktil strekkfasthet   = 1,3*f_ctm
  Ecm: number;      // sekantmodul [MPa]            = 22000*(f_cm/10)^0,3
}
export function concreteProps(fck: number): ConcreteProps {
  const fcm = fck + 8;
  // over C50/60 flater strekkfastheten ut -> logaritmisk uttrykk (tab. 3.1)
  const fctm = fck <= 50 ? 0.30 * Math.pow(fck, 2 / 3) : 2.12 * Math.log(1 + fcm / 10);
  return {
    fcm, fctm, fctk005: 0.7 * fctm, fctk095: 1.3 * fctm,
    Ecm: 22000 * Math.pow(fcm / 10, 0.3),
  };
}

/** Noekkelvidde for sekskantmutter som funksjon av gjengediameter. */
export const NUT_ACROSS_FLATS = 1.5;

/* ---------- Overdekning avledet av eksponeringsklasse, EC2 §4.4.1 ---------- */

export const EXPOSURE_CLASSES = [
  "X0", "XC1", "XC2/XC3", "XC4", "XD1/XS1", "XD2/XS2", "XD3/XS3",
] as const;
export type ExposureClass = typeof EXPOSURE_CLASSES[number];

/** Tabell 4.4N - c_min,dur [mm] for slakkarmering, konstruksjonsklasse S1..S6. */
const CMIN_DUR: Record<ExposureClass, number[]> = {
  "X0":      [10, 10, 10, 10, 15, 20],
  "XC1":     [10, 10, 10, 15, 20, 25],
  "XC2/XC3": [10, 15, 20, 25, 30, 35],
  "XC4":     [15, 20, 25, 30, 35, 40],
  "XD1/XS1": [20, 25, 30, 35, 40, 45],
  "XD2/XS2": [25, 30, 35, 40, 45, 50],
  "XD3/XS3": [30, 35, 40, 45, 50, 55],
};
/** Tabell 4.3N - fasthetsklasse som gir én klasse reduksjon for hver eksponering. */
const STRENGTH_RED: Record<ExposureClass, number> = {
  "X0": 30, "XC1": 30, "XC2/XC3": 35, "XC4": 40,
  "XD1/XS1": 40, "XD2/XS2": 40, "XD3/XS3": 45,
};

export interface CoverResult {
  strClass: number;    // konstruksjonsklasse S1..S6 etter tab. 4.3N
  cMinDur: number; cMinB: number; cMin: number; cNom: number;
}

/** c_nom = c_min + Dc_dev, med c_min = max(c_min,b; c_min,dur; 10 mm) (§4.4.1.2).
 *  Konstruksjonsklasse S4 er utgangspunkt: +2 ved 100 aars levetid, -1 ved
 *  fasthetsklasse over terskelen i tab. 4.3N. */
export function coverFromExposure(
  exp: ExposureClass, fck: number, designLife: number, phiOuter: number, dcDev: number,
): CoverResult {
  let s = 4;
  if (designLife >= 100) s += 2;
  if (fck >= (STRENGTH_RED[exp] ?? 999)) s -= 1;
  const strClass = Math.min(6, Math.max(1, s));
  const cMinDur = (CMIN_DUR[exp] ?? CMIN_DUR["XC4"])[strClass - 1];
  const cMinB = phiOuter;                       // enkeltstang: c_min,b = stangdiameter
  const cMin = Math.max(cMinB, cMinDur, 10);
  return { strClass, cMinDur, cMinB, cMin, cNom: cMin + dcDev };
}

export interface Inputs {
  // geometri [mm / grader]
  H_pil: number; H_wall: number; b: number; h: number; t_wall: number;
  // e_h (stag -> naermeste oppstikk) og e_s (V -> boyletyngdepunkt) legges IKKE inn:
  // begge foelger entydig av tverrsnittet, boltmoensteret og boylelagene.
  // Boltmoensteret kan ha ulik senteravstand paa tvers av og langs skjaerretningen.
  a1p: number; s_bolt_x: number; s_bolt_y: number; h_ef: number;
  theta: number;
  // c_nom legges IKKE inn: den avledes av eksponeringsklasse etter EC2 §4.4.1.
  exp_class: ExposureClass; design_life: number; dc_dev: number;
  // Fri eksentrisitet: avstand fra ringmurens senterlinje til pilasterens senterlinje.
  // e_p = 0 gir sentrisk pilaster; pilasteren trenger ikke flukte med noen murflate.
  e_p: number;
  // bolter
  n_bolt: number; boltsize: string; grade: string;
  // staalprofil paa bunnplata - kun visualisering/IFC, ingen kapasitetskontroll
  profile: string; profile_rot: number;
  anchor: AnchorKind; a_anch: number; t_pl: number; fy_pl: number;
  // forankring uten endeforankring (NS-EN 1992-1-1 §8.4)
  anch_shape: "rett" | "krok"; K_anch: number; alpha4: number; p_tr: number;
  // heftkoeffisient for gjengestag: f_bd = k_bd * eta1 * eta2 * f_ctd.
  // 2,25 gjelder kamstaal; for gjengestenger anbefaler Betongelementboka B19
  // pkt. 19.3.4 verdien 1,90 (se ASSUMPTIONS i report.ts).
  k_bd_bolt: number;
  // armering
  phi_b: number; n_ben: number; s_b: number; phi_v: number; n_v: number;
  // skjaernokk
  use_lug: boolean; w_lug: number; h_emb: number; t_grout: number; k_lug: number;
  // materialer
  // f_ctk,0.05 legges IKKE inn: den avledes av f_ck via tabell 3.1 (concreteProps).
  fck: number; a_cc: number; a_ct: number; g_c: number;
  fyk: number; g_s: number; g_Msre: number; eta1: number;
  // laster [kN]
  N_t: number; N_c: number; V: number;
}

export const BOLT_SIZES: Record<string, { d: number; P: number }> = {
  M16: { d: 16, P: 2.0 }, M20: { d: 20, P: 2.5 }, M24: { d: 24, P: 3.0 },
  M27: { d: 27, P: 3.0 }, M30: { d: 30, P: 3.5 }, M33: { d: 33, P: 3.5 },
  M36: { d: 36, P: 4.0 }, M39: { d: 39, P: 4.0 },
};
export const GRADES = ["4.6", "5.6", "5.8", "6.8", "8.8", "10.9", "12.9"];

export const DEFAULTS: Inputs = {
  H_pil: 900, H_wall: 900, b: 400, h: 400, t_wall: 250,
  a1p: 300, s_bolt_x: 200, s_bolt_y: 200, h_ef: 500, theta: 45,
  exp_class: "XD1/XS1", design_life: 50, dc_dev: 10,
  e_p: 75,
  n_bolt: 4, boltsize: "M30", grade: "8.8", profile: "HEA 200", profile_rot: 0, anchor: "plate", a_anch: 120, t_pl: 25, fy_pl: 355,
  anch_shape: "rett", K_anch: 0.05, alpha4: 1.0, p_tr: 0, k_bd_bolt: 1.9,
  phi_b: 12, n_ben: 2, s_b: 100, phi_v: 25, n_v: 8,
  use_lug: false, w_lug: 150, h_emb: 80, t_grout: 30, k_lug: 2.0,
  fck: 35, a_cc: 0.85, a_ct: 0.85, g_c: 1.5,
  fyk: 500, g_s: 1.15, g_Msre: 1.15, eta1: 1.0,
  N_t: 400, N_c: 500, V: 150,
};

/** Dimensjonerende forankringslengde etter NS-EN 1992-1-1 §8.4.3/§8.4.4. */
export interface BondAnchorage {
  phi: number; sigma_sd: number; eta2: number; fbd: number;
  a_clear: number; c_side: number; c_edge: number; cd: number;
  n_tvers: number; sumAst: number; sumAstMin: number; lambda: number;
  a1: number; a2: number; a3: number; a4: number; a5: number;
  // EC2 (8.5): produktet (a2*a3*a5) skal ikke settes lavere enn 0,7. Det er en
  // NEDRE GRENSE paa verdien som brukes - ikke en kontroll som kan ryke.
  alphaProdRaw: number; alphaProd: number; prodFloored: boolean;
  lb_rqd: number; lb_min: number; lbd: number;
}

/** Gjengestagenes senterposisjoner [x=⊥V, y=∥V] relativt pilastersenter.
 *  Rutenettet gjoeres saa kvadratisk som mulig; primtall faller tilbake til én rad.
 *  Dette er ETT sannhetsgrunnlag: bade compute(), buildModel() og 2D-planen bruker det,
 *  slik at antall stag i beregningen alltid er antallet som faktisk tegnes. */
export function boltPattern(n_bolt: number, sx: number, sy: number): [number, number][] {
  const n = Math.max(1, Math.round(n_bolt));
  let nx = Math.round(Math.sqrt(n));
  while (nx > 1 && n % nx !== 0) nx--;
  // flest rader langs den retningen som har stoerst senteravstand aa gi bort
  const [cx, cy] = nx >= n / nx ? [nx, n / nx] : [n / nx, nx];
  const pts: [number, number][] = [];
  for (let i = 0; i < cx; i++)
    for (let j = 0; j < cy; j++)
      pts.push([(i - (cx - 1) / 2) * sx, (j - (cy - 1) / 2) * sy]);
  return pts;
}

/** Oppstikkende jern fordelt rundt boyleomkretsen: alltid 4 hjoerner, resten
 *  fordelt paa sidene proporsjonalt med sidelengdene. Et symmetrisk oppsett gir
 *  alltid et PARTALL, saa forespurt antall rundes opp til naermeste mulige - og
 *  det er den FAKTISKE lengden som brukes videre i beregningen. */
export function barPattern(n_v: number, rx: number, ry: number): [number, number][] {
  const S = Math.max(4, Math.round((Math.max(4, Math.round(n_v)) + 4) / 2)); // = n_x + n_y
  const frac = rx + ry > 0 ? rx / (rx + ry) : 0.5;
  const nx = Math.min(S - 2, Math.max(2, Math.round(S * frac))), ny = S - nx;
  const pts: [number, number][] = [];
  for (let i = 0; i < nx; i++) {                    // sider parallelt med X, inkl. hjoerner
    const x = nx === 1 ? 0 : -rx + (2 * rx * i) / (nx - 1);
    pts.push([x, ry], [x, -ry]);
  }
  for (let j = 1; j < ny - 1; j++) {                // sider parallelt med Y, uten hjoerner
    const y = -ry + (2 * ry * j) / (ny - 1);
    pts.push([rx, y], [-rx, y]);
  }
  return pts;
}

/** Senterlinje-innrykk for armeringen i pilastertverrsnittet (X = b ⊥V, Y = h ∥V). */
export function cageInsets(g: Pick<Inputs, "b" | "h" | "phi_b" | "phi_v">, c_nom: number) {
  const cS = c_nom + g.phi_b / 2, cV = c_nom + g.phi_b + g.phi_v / 2;
  return { cS, cV, rxS: g.b / 2 - cS, ryS: g.h / 2 - cS, rxV: g.b / 2 - cV, ryV: g.h / 2 - cV };
}

export interface Results {
  conc: ConcreteProps; cover: CoverResult; c_nom: number; z_re: number;
  boltXY: [number, number][]; barXY: [number, number][]; n_v_eff: number;
  e_h: number; e_s: number;
  fcd: number; fctd: number; fbd: number; fbd_b: number; fbd_bolt: number; fyd: number;
  eta2_b: number; eta2_v: number; eta2_bolt: number;
  d_bolt: number; P_bolt: number; As_bolt: number; fub: number; fyb: number; gMs_b: number;
  isPlate: boolean; isNut: boolean; noAnchor: boolean; a_eff: number; a_nut: number;
  bond: BondAnchorage; l_avail: number; u_bond: number;
  c_bolt: number; boltFits: boolean;
  profExt: [number, number]; plateMargin: number; plateCovers: boolean;
  boltsClearProfile: boolean; boltsInProfile: number;
  A_phb: number; A_v1: number; d_eff: number; z: number; h_sone: number; n_lag: number; A_s_re: number;
  use_lug: boolean; e_s_eff: number; N_reV: number; A_lug: number; V_Rd_lug: number; u_lug: number;
  a_spread_n: number; T_nut: number; a_spread_p: number; T_plate: number;
  N_reA: number; N_reB: number; N_re: number; N_Rd_re: number; l1: number; N_Rd_a: number;
  n_lag_req: number; s_b_max: number; N_Rd_v: number; N_Rd_s: number; F_rod: number;
  Ac0: number; Ac1: number; F_Rdu: number; p_bear: number; c_pl: number; t_pl_req: number;
  sig_sd: number; lb_rqd: number; a6: number; l0: number; l_spread: number; h_ef_req: number;
  u_stal: number; u_ank: number; u_ax: number; u_bolt: number; u_bear: number; u_emb: number; u_plate: number;
  govA: boolean; allOk: boolean;
}

export function compute(g: Inputs): Results {
  const PI = Math.PI;
  const clamp07 = (x: number) => Math.min(Math.max(x, 0.7), 1.0);
  // Betongfasthetene foelger av f_ck alene (tab. 3.1) - ikke inndata.
  const CP = concreteProps(g.fck);
  // Overdekningen foelger av eksponeringsklassen (§4.4.1); ytterste staal er boylen.
  const cover = coverFromExposure(g.exp_class, g.fck, g.design_life, g.phi_b, g.dc_dev);
  const c_nom = cover.cNom;
  const fcd = g.a_cc * g.fck / g.g_c, fctd = g.a_ct * CP.fctk005 / g.g_c;
  const fyd = g.fyk / g.g_s;
  const BS = BOLT_SIZES[g.boltsize] ?? BOLT_SIZES.M30;
  const d_bolt = BS.d, P_bolt = BS.P;
  const As_bolt = PI / 4 * (d_bolt - 0.9382 * P_bolt) ** 2;
  // heftfasthet er diameteravhengig gjennom eta2 -> egen f_bd per stangtype.
  // Kamstaal: k_bd = 2,25 (EC2 §8.4.2). Gjengestag: k_bd fra input (default 1,90),
  // fordi 2,25 for kamstaal gjelder paa Ø_nom mens heftdiameteren er 1,10-1,20*Ø_nom;
  // for gjengestang er Ø_heft = Ø_nom (Betongelementboka B19 pkt. 19.3.4).
  const eta2_b = eta2Of(g.phi_b), eta2_v = eta2Of(g.phi_v), eta2_bolt = eta2Of(d_bolt);
  const fbdOf = (e2: number, k = 2.25) => k * g.eta1 * e2 * fctd;
  const fbd = fbdOf(eta2_v), fbd_b = fbdOf(eta2_b);
  const fbd_bolt = fbdOf(eta2_bolt, g.k_bd_bolt);
  const gr = String(g.grade).split("."), gX = +gr[0], gY = +gr[1];
  const fub = gX * 100, fyb = fub * gY / 10;
  const gMs_b = Math.max(1.2 * fub / fyb, 1.4);
  const isPlate = g.anchor === "plate", isNut = g.anchor === "mutter";
  const noAnchor = g.anchor === "ingen";
  // Endeforankringens lastflate. Mutter: sekskant med noekkelvidde 1,5*d ->
  // areal (sqrt3/2)*s^2, uttrykt som ekvivalent kvadratside a_eff.
  const a_nut = NUT_ACROSS_FLATS * d_bolt;
  const A_bear = isPlate ? g.a_anch ** 2
    : isNut ? Math.sqrt(3) / 2 * a_nut ** 2 : 0;
  const a_eff = Math.sqrt(A_bear);
  const A_phb = PI * g.phi_b ** 2 / 4, A_v1 = PI * g.phi_v ** 2 / 4;
  const d_eff = g.h - c_nom - g.phi_v / 2, z = 0.9 * d_eff;
  // NS-EN 1992-4: kun tilleggsarmering innenfor 0,75*h_ef fra festet regnes som
  // effektiv. Boylelagene ligger paa dybdene z_k = (c_nom + phi_b/2) + k*s_b, saa
  // sonen maales fra foerste lag ned til 0,75*h_ef (begrenset av pilasterhoyden).
  const z_re = 0.75 * g.h_ef;
  const z_first = c_nom + g.phi_b / 2;
  const h_sone = Math.max(0, Math.min(z_re, g.H_pil) - z_first);
  const n_lag = Math.max(1, Math.floor(h_sone / g.s_b) + 1);
  const A_s_re = g.n_ben * n_lag * A_phb;
  const use_lug = !!g.use_lug;

  // ---- Geometri utledet av tverrsnitt + moenstre (ikke inndata) ----
  const ins = cageInsets(g, c_nom);
  const boltXY = boltPattern(g.n_bolt, g.s_bolt_x, g.s_bolt_y);
  const barXY = barPattern(g.n_v, ins.rxV, ins.ryV);
  const n_v_eff = barXY.length;              // det som FAKTISK plasseres
  // e_h: korteste horisontale avstand fra et stag til naermeste oppstikk.
  // Radiell avstand (ikke bare akseavstand) - konservativt for bade spaltestrekk
  // (stoerre spredebredde => stoerre T) og for noedvendig innstoping.
  let e_h = Infinity;
  for (const [bx, by] of boltXY)
    for (const [ax, ay] of barXY) e_h = Math.min(e_h, Math.hypot(bx - ax, by - ay));
  if (!Number.isFinite(e_h)) e_h = 0;
  // e_s: dybde fra betongoverkant (der V angriper) til boylegruppas tyngdepunkt.
  // Med skjaernokk overfoeres V paa nokken i stedet -> arm til nokkens midthoyde.
  const e_s = c_nom + g.phi_b / 2 + g.s_b * (n_lag - 1) / 2;
  const e_s_eff = use_lug ? g.t_grout + g.h_emb / 2 : e_s;
  const N_reV = g.V * (1 + e_s_eff / z);
  const A_lug = g.w_lug * g.h_emb;
  const V_Rd_lug = Math.min(g.k_lug, 3) * fcd * A_lug / 1000;
  const u_lug = use_lug ? g.V / V_Rd_lug : 0;
  // Uten endeforankring finnes ingen konsentrert endelast -> ingen spaltestrekk derfra;
  // strekket foeres inn ved heft langs staget i stedet (se bond nedenfor).
  const a_spread_n = a_eff + 2 * e_h;
  const T_nut = noAnchor ? 0 : 0.25 * (1 - a_eff / a_spread_n) * g.N_t;
  const a_spread_p = Math.min(g.b, g.a1p + 2 * e_h);
  const T_plate = 0.25 * (1 - g.a1p / a_spread_p) * g.N_c;
  const N_reA = T_nut + N_reV, N_reB = T_plate + N_reV, N_re = Math.max(N_reA, N_reB);
  const N_Rd_re = A_s_re * g.fyk / g.g_Msre / 1000;
  const l1 = 8 * g.phi_b;
  const N_Rd_a = g.n_ben * n_lag * l1 * PI * g.phi_b * fbd / 0.7 / 1000;
  const cap1 = g.n_ben * A_phb * g.fyk / g.g_Msre / 1000;
  const n_lag_req = Math.max(1, Math.ceil(N_re / cap1));
  const s_b_max = n_lag_req > 1 ? h_sone / (n_lag_req - 1) : h_sone;
  const N_Rd_v = n_v_eff * A_v1 * fyd / 1000;   // faktisk antall oppstikk, ikke onsket
  const N_Rd_s = g.n_bolt * As_bolt * fub / gMs_b / 1000;
  const F_rod = g.N_t / g.n_bolt;
  const Ac0 = A_bear, Ac1 = a_spread_n ** 2;
  const F_Rdu = noAnchor ? 0 : Math.min(Math.sqrt(Ac1 / Ac0), 3) * fcd * Ac0 / 1000;
  const p_bear = noAnchor ? 0 : F_rod * 1000 / Ac0;
  const c_pl = Math.max((g.a_anch - d_bolt) / 2, 0.001);
  const t_pl_req = c_pl * Math.sqrt(3 * p_bear / g.fy_pl);

  // ---- Forankring av gjengestaget ved heft, NS-EN 1992-1-1 §8.4.3/§8.4.4 ----
  // Brukes som kontroll naar staget ikke har endeforankring ("ingen").
  const As_l = g.n_bolt * As_bolt;                       // samlet stagareal
  const sig_bolt = F_rod * 1000 / As_bolt;               // dimensjonerende stagspenning
  // fri avstand mellom naermeste nabostag i moensteret
  let sMin = Infinity;
  for (let i = 0; i < boltXY.length; i++)
    for (let j = i + 1; j < boltXY.length; j++)
      sMin = Math.min(sMin, Math.hypot(boltXY[i][0] - boltXY[j][0], boltXY[i][1] - boltXY[j][1]));
  const a_clear = Math.max((Number.isFinite(sMin) ? sMin : 0) - d_bolt, 0);
  // overdekning fra stag til naermeste betongflate, i hver retning
  // overdekning maales fra det YTTERSTE staget i moensteret
  const bxMax = Math.max(...boltXY.map((p) => Math.abs(p[0])));
  const byMax = Math.max(...boltXY.map((p) => Math.abs(p[1])));
  const c_side = Math.max(g.b / 2 - bxMax - d_bolt / 2, 0);          // ⊥V (paa tvers av mur)
  const c_edge = Math.max(g.h / 2 - byMax - d_bolt / 2, 0);          // ∥V (langs mur)
  // Faktisk (uklamret) overdekning til ytterste stag - negativ betyr at moensteret
  // ikke faar plass i tverrsnittet. Med n_bolt*s_bolt stort nok havner stagene
  // utenfor betongen, og det skal ikke gaa stille forbi.
  const c_bolt = Math.min(g.b / 2 - bxMax, g.h / 2 - byMax) - d_bolt / 2;
  const boltFits = c_bolt >= c_nom - 1e-9;

  // ---- Samsvar mellom staalprofil, bunnplate og boltmoenster (geometri) ----
  // Profilet inngaar ikke i kapasiteten, men bunnplata maa dekke det, og stagene
  // kan ikke ligge inne i profiltverrsnittet.
  const profExt = profileExtent(g.profile, g.profile_rot);
  const plateMargin = (g.a1p - Math.max(profExt[0], profExt[1])) / 2;
  const plateCovers = plateMargin >= 0;
  const boltsInProfile = boltXY.filter(([x, y]) =>
    profileContains(g.profile, g.profile_rot, x, y)).length;
  const boltsClearProfile = boltsInProfile === 0;
  const straight = g.anch_shape === "rett";
  // §8.4.4 tabell 8.2: rette stenger cd = min(a/2, c1, c); kroker cd = min(a/2, c1)
  const cd = straight ? Math.min(a_clear / 2, c_edge, c_side) : Math.min(a_clear / 2, c_edge);
  const lb_rqd_bolt = (d_bolt / 4) * (sig_bolt / fbd_bolt);
  const lb_min_bolt = Math.max(0.3 * lb_rqd_bolt, 10 * d_bolt, 100);   // strekk
  const ba1 = straight ? 1.0 : 0.7;
  const ba2 = clamp07(1 - 0.15 * (cd - d_bolt) / d_bolt);
  const ba4 = g.alpha4, ba5 = clamp07(1 - 0.04 * g.p_tr);
  const sumAstMin = 0.25 * As_l;
  // Antall boylelag langs l_bd avhenger av l_bd selv -> dempet fikspunkt-iterasjon.
  let lbd = Math.max(lb_rqd_bolt, lb_min_bolt);
  let n_tvers = 0, sumAst = 0, lambda = 0, ba3 = 1;
  for (let i = 0; i < 30; i++) {
    n_tvers = Math.max(0, Math.floor(lbd / g.s_b) + 1);
    sumAst = n_tvers * g.n_ben * A_phb;
    lambda = (sumAst - sumAstMin) / As_l;
    ba3 = clamp07(1 - g.K_anch * lambda);
    const prod = Math.max(ba2 * ba3 * ba5, 0.7);              // EC2 (8.5)
    const next = Math.max(ba1 * ba4 * prod * lb_rqd_bolt, lb_min_bolt);
    if (Math.abs(next - lbd) < 0.05) { lbd = next; break; }
    lbd = 0.5 * (lbd + next);                            // demping mot oscillasjon
  }
  const alphaProdRaw = ba2 * ba3 * ba5;
  const alphaProd = Math.max(alphaProdRaw, 0.7);
  const bond: BondAnchorage = {
    phi: d_bolt, sigma_sd: sig_bolt, eta2: eta2_bolt, fbd: fbd_bolt,
    a_clear, c_side, c_edge, cd, n_tvers, sumAst, sumAstMin, lambda,
    a1: ba1, a2: ba2, a3: ba3, a4: ba4, a5: ba5,
    alphaProdRaw, alphaProd, prodFloored: alphaProdRaw < 0.7 - 1e-9,
    lb_rqd: lb_rqd_bolt, lb_min: lb_min_bolt, lbd,
  };
  const l_avail = Math.max(g.h_ef - c_nom, 1e-6);      // tilgjengelig heftlengde
  const u_bond = noAnchor ? lbd / l_avail : 0;
  const sig_sd = Math.min(F_rod * 1000 / A_v1, fyd);
  const lb_rqd = (g.phi_v / 4) * (sig_sd / fbd);
  const a6 = 1.5;
  const l0 = Math.max(a6 * lb_rqd, 15 * g.phi_v, 200);
  const tan = Math.tan(g.theta * PI / 180);
  const l_spread = e_h / (tan || 1e-9);
  const h_ef_req = l_spread + l0 + c_nom;
  const u_stal = N_re / N_Rd_re, u_ank = N_re / N_Rd_a, u_ax = g.N_t / N_Rd_v,
    u_bolt = g.N_t / N_Rd_s, u_bear = noAnchor ? 0 : F_rod / F_Rdu, u_emb = h_ef_req / g.h_ef,
    u_plate = isPlate ? t_pl_req / g.t_pl : 0;
  // Endetrykk kontrolleres kun med endeforankring; uten den styrer heftforankringen.
  const checks = [u_stal, u_ank, u_ax, u_emb, u_bolt, g.s_b / s_b_max,
    boltFits ? 0 : 99,                                // moensteret maa faa plass
    plateCovers ? 0 : 99, boltsClearProfile ? 0 : 99, // profil vs plate/stag
    ...(noAnchor ? [u_bond] : [u_bear]),
    ...(isPlate ? [u_plate] : []), ...(use_lug ? [u_lug] : [])];
  const allOk = checks.every((u) => u <= 1.0001);
  return {
    conc: CP, cover, c_nom, z_re, boltXY, barXY, n_v_eff, e_h, e_s, c_bolt, boltFits,
    profExt, plateMargin, plateCovers, boltsClearProfile, boltsInProfile,
    fcd, fctd, fbd, fbd_b, fbd_bolt, fyd, eta2_b, eta2_v, eta2_bolt,
    d_bolt, P_bolt, As_bolt, fub, fyb, gMs_b,
    isPlate, isNut, noAnchor, a_eff, a_nut, bond, l_avail, u_bond,
    A_phb, A_v1, d_eff, z, h_sone, n_lag, A_s_re, use_lug, e_s_eff, N_reV, A_lug, V_Rd_lug, u_lug,
    a_spread_n, T_nut, a_spread_p, T_plate, N_reA, N_reB, N_re, N_Rd_re, l1, N_Rd_a,
    n_lag_req, s_b_max, N_Rd_v, N_Rd_s, F_rod, Ac0, Ac1, F_Rdu, p_bear, c_pl, t_pl_req,
    sig_sd, lb_rqd, a6, l0, l_spread, h_ef_req,
    u_stal, u_ank, u_ax, u_bolt, u_bear, u_emb, u_plate, govA: N_reA >= N_reB, allOk,
  };
}
