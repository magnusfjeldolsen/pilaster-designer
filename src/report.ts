// Sporbar beregningsrapport: symbol -> formel -> innsatte verdier -> resultat -> referanse.
// Ren data (ingen DOM), slik at den kan enhetstestes og rendres fritt.

import type { Inputs, Results } from "./calc";

export type DocRow =
  | { kind: "calc"; sym: string; fml: string; sub: string; res: string; ref: string }
  | { kind: "check"; sym: string; expr: string; ok: boolean; ref: string };

export interface DocGroup { title: string; rows: DocRow[] }

/** Symbolnavn (med _ for subscript) for hvert input-felt. */
export const SYM: Record<string, string> = {
  H_pil: "H_pilaster", H_wall: "H_ringmur",
  b: "b", h: "h", t_wall: "t_wall", e_p: "e_p",
  anch_shape: "stangform", K_anch: "K", alpha4: "α_4", p_tr: "p",
  a1p: "a_1,plate", s_bolt: "s_bolt", e_h: "e_h",
  h_ef: "h_ef", e_s: "e_s", theta: "θ", c_nom: "c_nom",
  n_bolt: "n_bolt", boltsize: "bolt", grade: "klasse", anchor: "endeforankr.",
  a_anch: "a_1,ende", t_pl: "t_plate", fy_pl: "f_y,plate",
  phi_b: "φ_b", n_ben: "n_ben", s_b: "s_b", phi_v: "φ_v", n_v: "n_v",
  use_lug: "skjærnokk", w_lug: "w_lug", h_emb: "h_emb", t_grout: "t_grout", k_lug: "k_lug",
  fck: "f_ck", a_cc: "α_cc", a_ct: "α_ct", g_c: "γ_c", fctk: "f_ctk", fyk: "f_yk", g_s: "γ_s",
  g_Msre: "γ_Ms,re", eta1: "η_1", N_t: "N_Ed,t", N_c: "N_Ed,c", V: "V_Ed",
};

/** Metadata for ett inputfelt. Eneste sannhetsgrunnlag: driver BADE inputpanelet
 *  og forutsetningstabellen i rapporten, slik at de ikke kan komme ut av synk. */
export interface InputMeta {
  k: keyof Inputs;
  label: string;              // norsk ledetekst i panelet
  unit: string;
  cmt: string;                // forklaring i rapporten / tooltip i panelet
  kind?: "num" | "sel" | "bool";
  opts?: string[];
}

const M = (k: keyof Inputs, label: string, unit: string, cmt: string,
  kind: InputMeta["kind"] = "num", opts?: string[]): InputMeta =>
  ({ k, label, unit, cmt, kind, opts });

export const INPUT_GROUPS: { title: string; items: InputMeta[] }[] = [
  { title: "Geometri", items: [
    M("H_pil", "Pilasterhøyde", "mm", "pilasterhøyde (OK → såle)"),
    M("H_wall", "Ringmurhøyde", "mm", "ringmurhøyde"),
    M("b", "Bredde b (⊥V)", "mm",
      "pilastermål på tvers av ringmuren (⊥ skjær) — må være > t_wall for at pilasteren skal stikke ut"),
    M("h", "Dybde h (∥V)", "mm",
      "pilastermål langs ringmuren (∥ skjær) — gir d_eff og indre arm z"),
    M("t_wall", "Ringmurtykkelse", "mm", "tykkelse ringmur"),
    M("e_p", "Eksentrisitet e_p", "mm",
      "avstand fra ringmurens senterlinje til pilasterens senterlinje; 0 = sentrisk. " +
      "Pilasteren trenger ikke flukte med noen murflate"),
    M("a1p", "Bunnplate a₁", "mm", "bunnplate — lastflatebredde (trykk)"),
    M("s_bolt", "Boltavstand s_bolt", "mm", "senteravstand stag"),
    M("e_h", "e_h stag→jern", "mm", "horisontal avstand stag → oppstikkende jern"),
    M("h_ef", "Innstøping h_ef", "mm", "innstøpingsdybde stag (mutter/plate i bunn)"),
    M("e_s", "Arm e_s", "mm", "arm: V (topp) → tyngdepunkt bøyler (uten nokk)"),
    M("theta", "Spredningsvinkel θ", "°", "spredningsvinkel endetrykk (fra loddrett)"),
    M("c_nom", "Overdekning c_nom", "mm", "overdekning") ] },
  { title: "Bolter", items: [
    M("n_bolt", "Antall stag", "stk", "antall gjengestag"),
    M("boltsize", "Boltdimensjon", "", "boltdimensjon", "sel"),
    M("grade", "Fasthetsklasse", "", "fasthetsklasse (f_ub=X·100, f_yb=X·100·Y/10)", "sel"),
    M("anchor", "Endeforankring", "",
      "ingen (forankres ved heft, §8.4) · mutter (nøkkelvidde 1,5·d) · plate (a₁ × a₁)",
      "sel", ["ingen", "mutter", "plate"]),
    M("a_anch", "Platebredde a₁", "mm", "sidekant kvadratisk ankerplate — gjelder kun «plate»"),
    M("t_pl", "Platetykkelse", "mm", "platetykkelse (kun ankerplate)"),
    M("fy_pl", "f_y plate", "MPa", "flytegrense plate/stål (S355)") ] },
  { title: "Heftforankring stag (§8.4)", items: [
    M("anch_shape", "Stangform", "", "rett stang (α₁=1,0) eller krok/sløyfe (α₁=0,7)",
      "sel", ["rett", "krok"]),
    M("K_anch", "K", "–",
      "tverrarmering, EC2 fig. 8.4: 0,1 stang inne i bøyd bøyle · 0,05 tverrarmering utenfor · 0"),
    M("alpha4", "α₄", "–", "sveiset tverrarmering: 1,0 uten sveis, 0,7 med"),
    M("p_tr", "p", "MPa", "tverrtrykk vinkelrett på spaltebruddflaten") ] },
  { title: "Armering", items: [
    M("phi_b", "Bøyle Ø", "mm", "bøylediameter"),
    M("n_ben", "Bøyleben n_ben", "stk", "bøyleben som krysser bruddflate/lag"),
    M("s_b", "Bøyleavstand s_b", "mm", "senteravstand bøyler (valgt)"),
    M("phi_v", "Oppstikk Ø", "mm", "diameter oppstikkende jern"),
    M("n_v", "Antall oppstikk", "stk", "antall oppstikkende jern") ] },
  { title: "Skjærnokk", items: [
    M("use_lug", "Bruk skjærnokk", "", "aktiver skjærnokk (shear lug)", "bool"),
    M("w_lug", "Nokkbredde", "mm", "nokkbredde (⊥ skjær)"),
    M("h_emb", "Nokkhøyde h_emb", "mm", "effektiv innstøpt høyde av nokk"),
    M("t_grout", "Slissestøp t_grout", "mm", "slissestøp/mørtel over betong"),
    M("k_lug", "Trykkfaktor k_lug", "–", "trykkfaktor betong foran nokk (§6.7, ≤3)") ] },
  { title: "Materialer", items: [
    M("fck", "f_ck", "MPa", "betong C35"),
    M("a_cc", "α_cc", "–", "NA trykkfaktor"),
    M("a_ct", "α_ct", "–", "NA strekkfaktor"),
    M("g_c", "γ_c", "–", "materialfaktor betong"),
    M("fctk", "f_ctk,0.05", "MPa", "f_ctk,0.05 (C35)"),
    M("fyk", "f_yk", "MPa", "B500NC"),
    M("g_s", "γ_s", "–", "materialfaktor armering"),
    M("g_Msre", "γ_Ms,re", "–", "matfaktor tilleggsarmering (EN 1992-4)"),
    M("eta1", "η₁ heftforhold", "–", "heftforhold (1,0 god / 0,7 dårlig)") ] },
  { title: "Laster", items: [
    M("N_t", "Aksial strekk N_Ed,t", "kN", "aksial STREKK (lasttilfelle A)"),
    M("N_c", "Aksial trykk N_Ed,c", "kN", "aksial TRYKK (lasttilfelle B)"),
    M("V", "Skjær V_Ed", "kN", "horisontal skjærkraft") ] },
];

/** Symbolsk formel per utgangssymbol. */
export const FML: Record<string, string> = {
  "f_cd": "α_cc·f_ck/γ_c", "f_ctd": "α_ct·f_ctk,0.05/γ_c", "f_bd": "2,25·η₁·η₂·f_ctd",
  "f_yd": "f_yk/γ_s", "A_φb": "π·φ_b²/4", "A_s,re": "n_ben·n_lag·A_φb",
  "A_s,bolt": "π/4·(d−0,9382·P)²", "f_ub": "X·100", "f_yb": "f_ub·Y/10",
  "d_eff": "h−c_nom−φ_v/2", "z": "0,9·d_eff", "h_sone": "min(h_ef−c; 1,5·h)",
  "n_lag": "⌊h_sone/s_b⌋+1",
  "N_Ed,re·V": "V_Ed·(1+e_s*/z)", "A_lug": "w_lug·h_emb", "V_Rd,lug": "k_lug·f_cd·A_lug",
  "a_spr,mut": "a₁+2·e_h", "a_spr,pl": "min(b; a_1,plate+2·e_h)",
  "T_mutter": "¼·(1−a₁/a)·N_Ed,t", "T_plate": "¼·(1−a₁/a)·N_Ed,c",
  "N_Rd,v": "n_v·A_v·f_yd", "N_Rd,s": "n_bolt·A_s,bolt·f_ub/γ_Ms",
  "F_Rdu": "A_c0·f_cd·√(A_c1/A_c0) ≤ 3f_cd·A_c0", "t_pl,nødv": "c·√(3p/f_y,plate)",
  "σ_sd": "N_Ed,t/(n_bolt·A_v) ≤ f_yd",
  "l_b,rqd": "(φ_v/4)·(σ_sd/f_bd)", "l_0": "α₆·l_b,rqd ≥ l_0,min",
  "l_spred": "e_h/tan θ", "h_ef,nødv": "l_spred+l_0+c_nom",
  "N_re,A": "T_mutter+N_Ed,re·V", "N_re,B": "T_plate+N_Ed,re·V",
  "N_Ed,re": "max(N_re,A; N_re,B)", "N_Rd,re": "A_s,re·f_yk/γ_Ms,re",
  "N_Rd,a": "n_ben·n_lag·l₁·π·φ_b·f_bd/α", "s_b,maks": "h_sone/(n_lag,nødv−1)",
  "e_p": "inndata", "utstikk": "e_p+b/2−t_wall/2", "a_eff": "√A_lastflate",
  "η_2": "1,0 (φ≤32) ellers (132−φ)/100", "f_bd,stag": "2,25·η₁·η₂·f_ctd",
  "σ_sd,stag": "N_Ed,t/(n_bolt·A_s,bolt)", "l_b,rqd,stag": "(d/4)·(σ_sd/f_bd)",
  "c_d": "min(a/2; c₁; c)", "α_1": "1,0 rett / 0,7 krok",
  "α_2": "1−0,15(c_d−φ)/φ", "α_3": "1−K·λ", "α_4": "sveiset tverrarmering",
  "α_5": "1−0,04·p", "λ": "(ΣA_st−ΣA_st,min)/A_s",
  "l_b,min": "max(0,3·l_b,rqd; 10φ; 100)",
  "l_bd": "max(α₁α₂α₃α₄α₅·l_b,rqd; l_b,min)", "l_heft": "h_ef−c_nom",
};

/** Standardhenvisning per utgangssymbol. */
export const REF: Record<string, string> = {
  "f_cd": "EC2 §3.1.6 +NA", "f_ctd": "EC2 §3.1.6", "f_bd": "EC2 §8.4.2", "f_yd": "EC2 §3.2.7",
  "A_φb": "geometri", "A_s,re": "EC2-4 §7.2.1", "N_Ed,re·V": "EC2-4 §7.2.2.5",
  "A_s,bolt": "ISO 898-1", "f_ub": "EN 1993-1-8", "f_yb": "EN 1993-1-8",
  "d_eff": "geometri", "z": "EC2 §6.2 (≈0,9d)", "h_sone": "D-region/St.Venant",
  "n_lag": "EC2-4 §7.2.1",
  "A_lug": "projisert areal", "V_Rd,lug": "EC2 §6.7 / ACI 349",
  "a_spr,mut": "STM θ°", "a_spr,pl": "STM θ°",
  "T_mutter": "EC2 §6.5.3/§6.7", "T_plate": "EC2 §6.5.3/§6.7",
  "N_Rd,v": "EC2 §6.1/§8.4", "N_Rd,s": "EN 1993-1-8", "F_Rdu": "EC2 §6.7",
  "t_pl,nødv": "EN 1993-1-8",
  "σ_sd": "EC2 §8.7.3", "l_b,rqd": "EC2 §8.4.3", "l_0": "EC2 §8.7.3",
  "l_spred": "STM 45°", "h_ef,nødv": "STM/§8.7",
  "N_re,A": "superposisjon", "N_re,B": "superposisjon",
  "N_Ed,re": "dim.", "N_Rd,re": "EC2-4 §7.2.1.9", "N_Rd,a": "EC2-4 §7.2.1/EC2 §8.4",
  "s_b,maks": "dim.", "e_p": "geometri", "utstikk": "geometri", "a_eff": "EC2 §6.7",
  "η_2": "EC2 §8.4.2", "f_bd,stag": "EC2 §8.4.2", "σ_sd,stag": "EC2 §8.4.3",
  "l_b,rqd,stag": "EC2 §8.4.3", "c_d": "EC2 §8.4.4 fig. 8.3", "α_1": "EC2 tab. 8.2",
  "α_2": "EC2 tab. 8.2", "α_3": "EC2 tab. 8.2", "α_4": "EC2 tab. 8.2", "α_5": "EC2 tab. 8.2",
  "λ": "EC2 §8.4.4", "l_b,min": "EC2 §8.4.4 (8.6)", "l_bd": "EC2 §8.4.4 (8.4)",
  "l_heft": "geometri",
};

const f0 = (x: number) => x.toFixed(0), f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2), f3 = (x: number) => x.toFixed(3);

export function buildReport(g: Inputs, R: Results): DocGroup[] {
  const groups: DocGroup[] = [];
  let cur: DocGroup;
  const G = (title: string) => groups.push((cur = { title, rows: [] }));
  const D = (sym: string, sub: string, res: string) =>
    cur.rows.push({ kind: "calc", sym, fml: FML[sym] ?? "", sub, res, ref: REF[sym] ?? "" });
  const C = (sym: string, expr: string, ok: boolean, ref: string) =>
    cur.rows.push({ kind: "check", sym, expr, ok, ref });

  G("Materialkonstanter");
  D("f_cd", `${g.a_cc}·${g.fck}/${g.g_c}`, `${f2(R.fcd)} MPa`);
  D("f_ctd", `${g.a_ct}·${g.fctk}/${g.g_c}`, `${f3(R.fctd)} MPa`);
  D("f_bd", `2,25·${g.eta1}·1,0·${f3(R.fctd)}`, `${f2(R.fbd)} MPa`);
  D("f_yd", `${g.fyk}/${g.g_s}`, `${f0(R.fyd)} MPa`);

  G("Pilastergeometri (V virker parallelt med ringmuren)");
  D("e_p", "inndata", `${f0(g.e_p)} mm`);
  D("utstikk", `${g.e_p}+${g.b}/2−${g.t_wall}/2`, `${f0(pilasterProjection(g))} mm`);

  G("Bolt fra dimensjon & klasse");
  D("A_s,bolt", `π/4·(${R.d_bolt}−0,9382·${R.P_bolt})²`, `${f0(R.As_bolt)} mm²`);
  D("f_ub", `${String(g.grade).split(".")[0]}·100`, `${f0(R.fub)} MPa`);
  D("f_yb", `${f0(R.fub)}·${String(g.grade).split(".")[1]}/10`, `${f0(R.fyb)} MPa`);
  D("a_eff", ANCHOR_SUB(g, R), R.noAnchor ? "ingen endeforankring" : `${f0(R.a_eff)} mm`);

  G("Fagverk-geometri (indre arm z)");
  D("d_eff", `${g.h}−${g.c_nom}−${g.phi_v}/2`, `${f0(R.d_eff)} mm`);
  D("z", `0,9·${f0(R.d_eff)}`, `${f0(R.z)} mm`);

  G("Effektiv sone & bøylelag");
  D("h_sone", `min(${g.h_ef}−${g.c_nom}; 1,5·${g.h})`, `${f0(R.h_sone)} mm`);
  D("n_lag", `⌊${f0(R.h_sone)}/${g.s_b}⌋+1`, `${f0(R.n_lag)} stk`);
  D("A_s,re", `${g.n_ben}·${f0(R.n_lag)}·${f0(R.A_phb)}`, `${f0(R.A_s_re)} mm²`);

  G("Skjær — tilleggsarmering (NS-EN 1992-4 §7.2.2)" + (R.use_lug ? " + skjærnokk" : ""));
  D("N_Ed,re·V", `${g.V}·(1+${f0(R.e_s_eff)}/${f0(R.z)})`, `${f1(R.N_reV)} kN`);
  if (R.use_lug) {
    D("A_lug", `${g.w_lug}·${g.h_emb}`, `${f0(R.A_lug)} mm²`);
    D("V_Rd,lug", `${g.k_lug}·${f2(R.fcd)}·${f0(R.A_lug)}`, `${f1(R.V_Rd_lug)} kN`);
  }

  G("Spaltestrekk fra endeforankring / bunnplate (NS-EN 1992-1-1 §6.5/§6.7)");
  D("a_spr,mut", `${f0(R.a_eff)}+2·${g.e_h}`, `${f0(R.a_spread_n)} mm`);
  D("a_spr,pl", `min(${g.b}; ${g.a1p}+2·${g.e_h})`, `${f0(R.a_spread_p)} mm`);
  D("T_mutter", R.noAnchor ? "ingen endeforankring → ingen endelast"
    : `¼(1−${f0(R.a_eff)}/${f0(R.a_spread_n)})·${g.N_t}`, `${f1(R.T_nut)} kN`);
  D("T_plate", `¼(1−${g.a1p}/${f0(R.a_spread_p)})·${g.N_c}`, `${f1(R.T_plate)} kN`);

  G("Aksialforankring — oppstikk & boltstål");
  D("N_Rd,v", `${g.n_v}·${f0(R.A_v1)}·${f0(R.fyd)}`, `${f0(R.N_Rd_v)} kN`);
  D("N_Rd,s", `${g.n_bolt}·${f0(R.As_bolt)}·${f0(R.fub)}/${f2(R.gMs_b)}`, `${f0(R.N_Rd_s)} kN`);

  if (!R.noAnchor) {
    G("Endeforankring — trykk (NS-EN 1992-1-1 §6.7)");
    D("F_Rdu", `min(√(${f0(R.Ac1)}/${f0(R.Ac0)});3)·${f2(R.fcd)}·${f0(R.Ac0)}`, `${f1(R.F_Rdu)} kN`);
    if (R.isPlate)
      D("t_pl,nødv", `${f0(R.c_pl)}·√(3·${f0(R.p_bear)}/${g.fy_pl})`, `${f0(R.t_pl_req)} mm`);
  } else {
    // Uten endeforankring maa hele stagkraften foeres inn ved heft langs staget.
    const B = R.bond;
    G("Forankring av stag ved heft — ingen endeforankring (NS-EN 1992-1-1 §8.4)");
    D("η_2", `${R.d_bolt} ${R.d_bolt <= 32 ? "≤" : ">"} 32 mm`, f2(B.eta2));
    D("f_bd,stag", `2,25·${g.eta1}·${f2(B.eta2)}·${f3(R.fctd)}`, `${f2(B.fbd)} MPa`);
    D("σ_sd,stag", `${g.N_t}·10³/(${g.n_bolt}·${f0(R.As_bolt)})`, `${f0(B.sigma_sd)} MPa`);
    D("l_b,rqd,stag", `(${R.d_bolt}/4)(${f0(B.sigma_sd)}/${f2(B.fbd)})`, `${f0(B.lb_rqd)} mm`);
    D("c_d", g.anch_shape === "rett"
      ? `min(${f0(B.a_clear)}/2; ${f0(B.c_edge)}; ${f0(B.c_side)})`
      : `min(${f0(B.a_clear)}/2; ${f0(B.c_edge)})`, `${f0(B.cd)} mm`);
    D("α_1", g.anch_shape === "rett" ? "rett stang" : "krok/sløyfe", f2(B.a1));
    D("α_2", `1−0,15(${f0(B.cd)}−${R.d_bolt})/${R.d_bolt}`, f3(B.a2));
    D("λ", `(${f0(B.sumAst)}−${f0(B.sumAstMin)})/${f0(g.n_bolt * R.As_bolt)}`, f3(B.lambda));
    D("α_3", `1−${g.K_anch}·${f3(B.lambda)}  (${B.n_tvers} bøylelag langs l_bd)`, f3(B.a3));
    D("α_4", "inndata", f2(B.a4));
    D("α_5", `1−0,04·${g.p_tr}`, f3(B.a5));
    D("l_b,min", `max(0,3·${f0(B.lb_rqd)}; 10·${R.d_bolt}; 100)`, `${f0(B.lb_min)} mm`);
    D("l_bd", `max(${f3(B.a1 * B.a2 * B.a3 * B.a4 * B.a5)}·${f0(B.lb_rqd)}; ${f0(B.lb_min)})`,
      `${f0(B.lbd)} mm`);
    D("l_heft", `${g.h_ef}−${g.c_nom}`, `${f0(R.l_avail)} mm`);
  }

  G("Omfaring stag→oppstikk & innstøping (NS-EN 1992-1-1 §8.7 / STM)");
  D("σ_sd", `${g.N_t}·10³/(${g.n_bolt}·${f0(R.A_v1)})`, `${f0(R.sig_sd)} MPa`);
  D("l_b,rqd", `(${g.phi_v}/4)(${f0(R.sig_sd)}/${f2(R.fbd)})`, `${f0(R.lb_rqd)} mm`);
  D("l_0", `${f2(R.a6)}·${f0(R.lb_rqd)}`, `${f0(R.l0)} mm`);
  D("l_spred", `${g.e_h}/tan ${g.theta}°`, `${f0(R.l_spread)} mm`);
  D("h_ef,nødv", `${f0(R.l_spread)}+${f0(R.l0)}+${g.c_nom}`, `${f0(R.h_ef_req)} mm`);

  G("Bøyler — dimensjonerende & kapasitet (NS-EN 1992-4 §7.2.1)");
  D("N_re,A", `${f1(R.T_nut)}+${f1(R.N_reV)}`, `${f1(R.N_reA)} kN`);
  D("N_re,B", `${f1(R.T_plate)}+${f1(R.N_reV)}`, `${f1(R.N_reB)} kN`);
  D("N_Ed,re", `max(${f1(R.N_reA)}; ${f1(R.N_reB)})`, `${f1(R.N_re)} kN`);
  D("N_Rd,re", `${f0(R.A_s_re)}·${g.fyk}/${g.g_Msre}`, `${f1(R.N_Rd_re)} kN`);
  D("N_Rd,a", `${g.n_ben}·${f0(R.n_lag)}·${f0(R.l1)}·π·${g.phi_b}·${f2(R.fbd)}/0,7`,
    `${f1(R.N_Rd_a)} kN`);
  D("s_b,maks", `${f0(R.h_sone)}/(${R.n_lag_req}−1)`, `${f0(R.s_b_max)} mm`);

  G("Kontroller");
  if (R.use_lug)
    C("Skjærnokk", `V_Ed ${g.V} ≤ V_Rd,lug ${f1(R.V_Rd_lug)} kN  (u=${f2(R.u_lug)})`,
      R.u_lug <= 1, "EC2 §6.7");
  C("Bøyleavstand", `valgt s_b ${f0(g.s_b)} ≤ s_b,maks ${f0(R.s_b_max)} mm`,
    g.s_b <= R.s_b_max, "dim.");
  C("Stål (bøyler)", `N_Ed,re ${f1(R.N_re)} ≤ N_Rd,re ${f1(R.N_Rd_re)} kN  (u=${f2(R.u_stal)})`,
    R.u_stal <= 1, "EC2-4 §7.2.1.9");
  C("Forankring bøyle", `N_Ed,re ${f1(R.N_re)} ≤ N_Rd,a ${f1(R.N_Rd_a)} kN  (u=${f2(R.u_ank)})`,
    R.u_ank <= 1, "EC2-4 §7.2.1");
  if (R.noAnchor) {
    C("Heftforankring stag",
      `l_bd ${f0(R.bond.lbd)} ≤ h_ef−c ${f0(R.l_avail)} mm  (u=${f2(R.u_bond)})`,
      R.u_bond <= 1, "EC2 §8.4.4");
    C("α-produkt", `α₂·α₃·α₅ = ${f3(R.bond.alphaProd)} ≥ 0,7`, R.bond.prodOk, "EC2 §8.4.4");
  } else {
    C("Endetrykk", `N_Ed,t/n ${f1(R.F_rod)} ≤ F_Rdu ${f1(R.F_Rdu)} kN  (u=${f2(R.u_bear)})`,
      R.u_bear <= 1, "EC2 §6.7");
  }
  if (R.isPlate)
    C("Platetykkelse", `t_nødv ${f0(R.t_pl_req)} ≤ t_plate ${g.t_pl} mm  (u=${f2(R.u_plate)})`,
      R.u_plate <= 1, "EN 1993-1-8");
  C("Aksial (oppstikk)", `N_Ed,t ${g.N_t} ≤ N_Rd,v ${f0(R.N_Rd_v)} kN  (u=${f2(R.u_ax)})`,
    R.u_ax <= 1, "EC2 §8.4");
  C("Bolt", `N_Ed,t ${g.N_t} ≤ N_Rd,s ${f0(R.N_Rd_s)} kN  (u=${f2(R.u_bolt)})`,
    R.u_bolt <= 1, "EN 1993-1-8");
  C("Innstøping", `h_ef,nødv ${f0(R.h_ef_req)} ≤ h_ef ${g.h_ef} mm  (u=${f2(R.u_emb)})`,
    R.u_emb <= 1, "EC2 §8.7/STM");

  return groups;
}

/** Eksentrisitet pilaster ift. ringmursenter (samme uttrykk som 3D-modellen). */
export function pilasterEcc(v: Inputs): number {
  return v.e_p;
}

/** Hvor langt pilasteren stikker ut forbi murflaten paa den positive siden.
 *  Negativ verdi betyr at pilasteren ligger innenfor murlivet paa den siden. */
export function pilasterProjection(v: Inputs): number {
  return v.e_p + v.b / 2 - v.t_wall / 2;
}

/** Beskrivelse av lastflaten for endeforankringen. */
const ANCHOR_SUB = (g: Inputs, R: Results): string =>
  R.isPlate ? `kvadratisk plate ${g.a_anch}×${g.a_anch}`
    : R.isNut ? `sekskantmutter, nøkkelvidde 1,5·${R.d_bolt} = ${R.a_nut.toFixed(0)} mm ` +
        `→ A = (√3/2)·s²`
    : "—";

export const ASSUMPTIONS_HTML = `
<h3>Standardreferanser &amp; forutsetninger</h3>
<ul>
 <li><b>NS-EN 1992-1-1:2004+A1:2014 + NA:2021</b> — Betong, allmenne regler:
     <code>§3.1.6</code> f_cd/f_ctd (NA: α_cc=α_ct=0,85), <code>§3.2.7</code> f_yd,
     <code>§6.5</code> stavverksmodeller, <code>§6.7</code> partielt belastede arealer,
     <code>§8.4</code> forankring (f_bd, l_b,rqd), <code>§8.7</code> omfaring (l_0, α_6, tverrarmering).</li>
 <li><b>NS-EN 1992-4:2018</b> — Innfesting i betong:
     <code>§7.2.1</code> strekk m/tilleggsarmering, <code>§7.2.2</code> skjær m/tilleggsarmering,
     <code>§7.2.3</code> kombinert last; materialfaktor tilleggsarmering <code>γ_Ms,re=1,15</code>.</li>
 <li><b>NS-EN 1993-1-8 + ISO 898-1</b> — Bolt/gjengestag: <code>A_s</code> fra dimensjon (stigning P),
     klasse X.Y ⇒ <code>f_ub=X·100</code>, <code>f_yb=f_ub·Y/10</code> (8.8→640, 10.9→900, 12.9→1080 MPa);
     platetykkelse fra bøyning (kanttrykk).</li>
 <li><b>Endeforankring — tre alternativer:</b>
     <code>plate</code> gir kvadratisk lastflate <code>a₁×a₁</code>;
     <code>mutter</code> er sekskantmutter etter ISO 4032 med nøkkelvidde <code>s=1,5·d</code> og høyde
     <code>≈0,8·d</code>, lastflate <code>(√3/2)·s²</code> uttrykt som ekvivalent kvadratside
     <code>a_eff=√A</code>;
     <code>ingen</code> gir <b>ingen</b> konsentrert endelast — da bortfaller både endetrykkontrollen
     (§6.7) og spaltestrekket fra endeforankringen, og hele stagkraften må i stedet forankres ved
     <b>heft</b> etter NS-EN 1992-1-1 §8.4: <code>l_bd = max(α₁α₂α₃α₄α₅·l_b,rqd; l_b,min)</code> med
     <code>l_b,rqd=(d/4)(σ_sd/f_bd)</code>, <code>f_bd=2,25·η₁·η₂·f_ctd</code> og
     <code>η₂=1,0</code> for <code>φ≤32</code> ellers <code>(132−φ)/100</code>. Kontrollen er
     <code>l_bd ≤ h_ef−c_nom</code>. Antall bøylelag langs <code>l_bd</code> (som inngår i α₃) løses
     ved iterasjon. Merk at heftmodellen i EC2 er utviklet for <b>kamstål</b>; for glatt gjengestang
     bør heftfastheten vurderes særskilt av ansvarlig prosjekterende.</li>
 <li><b>Skjærnokk (shear lug):</b> betongtrykk foran nokk på <b>projisert areal</b> <code>A_lug=w·h_emb</code>,
     NS-EN 1992-1-1 §6.7 (evt. ACI 349 App. D / 35°-utbruddskjegle). Nokk reduserer hengarmen til
     <code>e_s*=t_grout+h_emb/2</code>. Kan slås av/på.</li>
 <li><b>Pilastergeometri og lastretning:</b> Skjærkraften <code>V_Ed</code> forutsettes å virke
     <b>parallelt med ringmuren</b>. Dermed er <code>h</code> (∥V) målet langs muren — det som gir
     <code>d_eff</code> og indre arm <code>z</code> — mens <code>b</code> (⊥V) er målet på tvers av muren.
     Plasseringen settes fritt med <code>e_p</code> = avstand fra ringmurens senterlinje til pilasterens
     senterlinje. Pilasteren trenger <b>ikke</b> flukte med noen murflate: utstikket forbi murflaten er
     <code>e_p+b/2−t_wall/2</code>, og bøyler/armering ligger innenfor pilastertverrsnittet uansett.
     Eksentrisiteten gjelder kun geometri/uttegning; kapasitetsmodellen forutsetter leddet søylefot uten
     moment og påvirkes derfor ikke av plasseringen. Skjær på tvers av muren (og samtidig skjær i to
     retninger) er <b>ikke</b> dekket av denne versjonen.</li>
 <li><b>Materialer:</b> Betong C35 (f_ck=35 MPa, f_ctk,0.05=2,25 MPa — tab. 3.1); armering B500NC
     (f_yk=500 MPa); γ_c=1,5, γ_s=1,15.</li>
 <li><b>Modellforutsetninger:</b> Leddet søylefot (aksial ± og skjær, uten moment). Bøyler tar spaltestrekk
     (ende + plate) + skjærfagverk <code>V·(1+e_s/z)</code> (konservativ addisjon). Aksialstrekket føres av
     de oppstikkende jernene ned i såla; endetrykket spres θ° (default 45°) ut til jernene, som styrer
     omfaring <code>l₀</code> og innstøping. Dimensjonerende resultat er <b>bøyleavstand s_b</b> og
     <b>l₀/h_ef</b>. Verktøyet er en beregningshjelp — resultatet skal kontrolleres av ansvarlig
     prosjekterende (RIB).</li>
</ul>`;
