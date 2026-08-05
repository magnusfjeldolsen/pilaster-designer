// Beregningsmodul (NS-EN 1992-4) - portert fra regnearket.
// Ren funksjon: Inputs -> Results. Ingen DOM-avhengighet.

export interface Inputs {
  // geometri [mm / grader]
  H_pil: number; H_wall: number; b: number; h: number; t_wall: number;
  a1p: number; s_bolt: number; e_h: number; h_ef: number; e_s: number;
  theta: number; c_nom: number;
  // bolter
  n_bolt: number; boltsize: string; grade: string;
  anchor: "mutter" | "plate"; a_anch: number; t_pl: number; fy_pl: number;
  // armering
  phi_b: number; n_ben: number; s_b: number; phi_v: number; n_v: number;
  // skjaernokk
  use_lug: boolean; w_lug: number; h_emb: number; t_grout: number; k_lug: number;
  // materialer
  fck: number; a_cc: number; a_ct: number; g_c: number; fctk: number;
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
  a1p: 300, s_bolt: 200, e_h: 120, h_ef: 500, e_s: 150, theta: 45, c_nom: 50,
  n_bolt: 4, boltsize: "M30", grade: "8.8", anchor: "plate", a_anch: 120, t_pl: 25, fy_pl: 355,
  phi_b: 12, n_ben: 2, s_b: 100, phi_v: 25, n_v: 8,
  use_lug: false, w_lug: 150, h_emb: 80, t_grout: 30, k_lug: 2.0,
  fck: 35, a_cc: 0.85, a_ct: 0.85, g_c: 1.5, fctk: 2.25,
  fyk: 500, g_s: 1.15, g_Msre: 1.15, eta1: 1.0,
  N_t: 400, N_c: 500, V: 150,
};

export interface Results {
  fcd: number; fctd: number; fbd: number; fyd: number;
  d_bolt: number; P_bolt: number; As_bolt: number; fub: number; fyb: number; gMs_b: number; isPlate: boolean;
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
  const fcd = g.a_cc * g.fck / g.g_c, fctd = g.a_ct * g.fctk / g.g_c;
  const fbd = 2.25 * g.eta1 * 1.0 * fctd, fyd = g.fyk / g.g_s;
  const BS = BOLT_SIZES[g.boltsize] ?? BOLT_SIZES.M30;
  const d_bolt = BS.d, P_bolt = BS.P;
  const As_bolt = PI / 4 * (d_bolt - 0.9382 * P_bolt) ** 2;
  const gr = String(g.grade).split("."), gX = +gr[0], gY = +gr[1];
  const fub = gX * 100, fyb = fub * gY / 10;
  const gMs_b = Math.max(1.2 * fub / fyb, 1.4);
  const isPlate = g.anchor === "plate";
  const A_phb = PI * g.phi_b ** 2 / 4, A_v1 = PI * g.phi_v ** 2 / 4;
  const d_eff = g.h - g.c_nom - g.phi_v / 2, z = 0.9 * d_eff;
  const h_sone = Math.min(g.h_ef - g.c_nom, 1.5 * g.h);
  const n_lag = Math.max(1, Math.floor(h_sone / g.s_b) + 1);
  const A_s_re = g.n_ben * n_lag * A_phb;
  const use_lug = !!g.use_lug;
  const e_s_eff = use_lug ? g.t_grout + g.h_emb / 2 : g.e_s;
  const N_reV = g.V * (1 + e_s_eff / z);
  const A_lug = g.w_lug * g.h_emb;
  const V_Rd_lug = Math.min(g.k_lug, 3) * fcd * A_lug / 1000;
  const u_lug = use_lug ? g.V / V_Rd_lug : 0;
  const a_spread_n = g.a_anch + 2 * g.e_h;
  const T_nut = 0.25 * (1 - g.a_anch / a_spread_n) * g.N_t;
  const a_spread_p = Math.min(g.b, g.a1p + 2 * g.e_h);
  const T_plate = 0.25 * (1 - g.a1p / a_spread_p) * g.N_c;
  const N_reA = T_nut + N_reV, N_reB = T_plate + N_reV, N_re = Math.max(N_reA, N_reB);
  const N_Rd_re = A_s_re * g.fyk / g.g_Msre / 1000;
  const l1 = 8 * g.phi_b;
  const N_Rd_a = g.n_ben * n_lag * l1 * PI * g.phi_b * fbd / 0.7 / 1000;
  const cap1 = g.n_ben * A_phb * g.fyk / g.g_Msre / 1000;
  const n_lag_req = Math.max(1, Math.ceil(N_re / cap1));
  const s_b_max = n_lag_req > 1 ? h_sone / (n_lag_req - 1) : h_sone;
  const N_Rd_v = g.n_v * A_v1 * fyd / 1000;
  const N_Rd_s = g.n_bolt * As_bolt * fub / gMs_b / 1000;
  const F_rod = g.N_t / g.n_bolt;
  const Ac0 = g.a_anch ** 2, Ac1 = a_spread_n ** 2;
  const F_Rdu = Math.min(Math.sqrt(Ac1 / Ac0), 3) * fcd * Ac0 / 1000;
  const p_bear = F_rod * 1000 / Ac0;
  const c_pl = Math.max((g.a_anch - d_bolt) / 2, 0.001);
  const t_pl_req = c_pl * Math.sqrt(3 * p_bear / g.fy_pl);
  const sig_sd = Math.min(F_rod * 1000 / A_v1, fyd);
  const lb_rqd = (g.phi_v / 4) * (sig_sd / fbd);
  const a6 = 1.5;
  const l0 = Math.max(a6 * lb_rqd, 15 * g.phi_v, 200);
  const tan = Math.tan(g.theta * PI / 180);
  const l_spread = g.e_h / (tan || 1e-9);
  const h_ef_req = l_spread + l0 + g.c_nom;
  const u_stal = N_re / N_Rd_re, u_ank = N_re / N_Rd_a, u_ax = g.N_t / N_Rd_v,
    u_bolt = g.N_t / N_Rd_s, u_bear = F_rod / F_Rdu, u_emb = h_ef_req / g.h_ef,
    u_plate = isPlate ? t_pl_req / g.t_pl : 0;
  const checks = [u_stal, u_ank, u_ax, u_bear, u_emb, u_bolt, g.s_b / s_b_max,
    ...(isPlate ? [u_plate] : []), ...(use_lug ? [u_lug] : [])];
  const allOk = checks.every((u) => u <= 1.0001);
  return {
    fcd, fctd, fbd, fyd, d_bolt, P_bolt, As_bolt, fub, fyb, gMs_b, isPlate,
    A_phb, A_v1, d_eff, z, h_sone, n_lag, A_s_re, use_lug, e_s_eff, N_reV, A_lug, V_Rd_lug, u_lug,
    a_spread_n, T_nut, a_spread_p, T_plate, N_reA, N_reB, N_re, N_Rd_re, l1, N_Rd_a,
    n_lag_req, s_b_max, N_Rd_v, N_Rd_s, F_rod, Ac0, Ac1, F_Rdu, p_bear, c_pl, t_pl_req,
    sig_sd, lb_rqd, a6, l0, l_spread, h_ef_req,
    u_stal, u_ank, u_ax, u_bolt, u_bear, u_emb, u_plate, govA: N_reA >= N_reB, allOk,
  };
}
