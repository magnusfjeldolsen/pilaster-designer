import { describe, it, expect } from "vitest";
import { compute, concreteProps, DEFAULTS, type Inputs } from "./calc";

describe("compute() – materialer og bolt", () => {
  const R = compute(DEFAULTS);
  it("betong C35 + NA gir riktige dimensjonerende fastheter", () => {
    expect(R.fcd).toBeCloseTo(19.83, 1);
    expect(R.fctd).toBeCloseTo(1.275, 2);
    expect(R.fbd).toBeCloseTo(2.87, 1);
    expect(R.fyd).toBeCloseTo(434.8, 0);
  });
  it("M30 spenningsareal ~561 mm^2", () => {
    expect(R.As_bolt).toBeGreaterThan(558);
    expect(R.As_bolt).toBeLessThan(564);
  });
  it("boltklasse 8.8 -> f_ub=800, f_yb=640", () => {
    expect(R.fub).toBe(800);
    expect(R.fyb).toBe(640);
  });
  it("boltklasse 10.9 og 12.9", () => {
    expect(compute({ ...DEFAULTS, grade: "10.9" }).fub).toBe(1000);
    expect(compute({ ...DEFAULTS, grade: "10.9" }).fyb).toBe(900);
    expect(compute({ ...DEFAULTS, grade: "12.9" }).fyb).toBe(1080);
  });
});

describe("compute() – geometri og fagverk", () => {
  const R = compute(DEFAULTS);
  it("indre arm z = 0,9*d_eff", () => {
    expect(R.d_eff).toBeCloseTo(342.5, 1);
    expect(R.z).toBeCloseTo(308.25, 1);
  });
  it("effektiv sone og antall boylelag", () => {
    // EC2-4: kun armering innenfor 0,75*h_ef er effektiv -> sonen slutter der
    expect(R.z_re).toBe(0.75 * DEFAULTS.h_ef);              // 375 mm
    expect(R.h_sone).toBe(324);                             // 375 - (45 + 6)
    expect(R.n_lag).toBe(4);                                // var 5 med gammel sone
  });
  it("e_s avledes av boylegruppa: c+phi_b/2 + s_b*(n_lag-1)/2", () => {
    expect(R.e_s).toBeCloseTo(R.c_nom + 6 + 100 * (R.n_lag - 1) / 2, 6);   // = 201
    expect(R.e_s_eff).toBe(R.e_s);                              // uten nokk
  });
  it("skjaertie N_re,V = V*(1+e_s/z) med avledet e_s", () => {
    expect(R.N_reV).toBeCloseTo(DEFAULTS.V * (1 + R.e_s / R.z), 6);
    expect(R.N_reV).toBeCloseTo(247.8, 0);   // var 224,1 med e_s = 150 lagt inn
  });
  it("spaltestrekk fra endeforankring med avledet e_h", () => {
    expect(R.T_nut).toBeCloseTo(0.25 * (1 - R.a_eff / R.a_spread_n) * DEFAULTS.N_t, 6);
    expect(R.T_nut).toBeCloseTo(41.8, 0);    // var 66,7 med e_h = 120 lagt inn
  });
  it("dimensjonerende boylestrekk (LT A styrer)", () => {
    expect(R.govA).toBe(true);
    expect(R.N_re).toBeCloseTo(289.6, 0);    // var 290,8
  });
});

describe("compute() – 8O25 aksial og lug/plate", () => {
  it("8O25 B500 kapasitet ~1707 kN, lav utnyttelse for 400 kN", () => {
    const R = compute(DEFAULTS);
    expect(R.N_Rd_v).toBeGreaterThan(1690);
    expect(R.u_ax).toBeLessThan(0.3);
  });
  it("skjaernokk paa -> egen trykkontroll og redusert arm", () => {
    const off = compute(DEFAULTS);
    const on = compute({ ...DEFAULTS, use_lug: true });
    expect(on.e_s_eff).toBeLessThan(off.e_s_eff); // nokk gir kortere arm
    expect(on.V_Rd_lug).toBeGreaterThan(0);
    expect(on.u_lug).toBeGreaterThan(0);
  });
  it("med ankerplate er default-innstopingen rikelig", () => {
    const R = compute(DEFAULTS);
    // Kraften baeres av plata; oppstikkene skal bare FORANKRES, ikke skjoetes.
    expect(R.h_ef_req).toBeLessThan(DEFAULTS.h_ef);
    expect(R.h_ef_req).toBeCloseTo(338, 0);
    expect(R.u_emb).toBeLessThan(1);
  });
  it("okt innstoping + tettere boyler -> allOk=true", () => {
    const good: Inputs = { ...DEFAULTS, h_ef: 900, s_b: 90 };
    expect(compute(good).u_emb).toBeLessThanOrEqual(1);
  });
});

describe("compute() – endeforankring: ingen / mutter / plate", () => {
  it("mutter bruker noekkelvidde 1,5*d og sekskantareal, ikke a_anch", () => {
    const R = compute({ ...DEFAULTS, anchor: "mutter" });
    expect(R.isNut).toBe(true);
    expect(R.a_nut).toBeCloseTo(1.5 * R.d_bolt, 6);              // M30 -> 45 mm
    // lastflate = (sqrt3/2)*s^2, uttrykt som ekvivalent kvadratside
    expect(R.Ac0).toBeCloseTo(Math.sqrt(3) / 2 * R.a_nut ** 2, 4);
    expect(R.a_eff).toBeCloseTo(Math.sqrt(R.Ac0), 6);
    // a_anch (120) skal ikke lenger paavirke mutter-tilfellet
    expect(compute({ ...DEFAULTS, anchor: "mutter", a_anch: 300 }).a_eff).toBeCloseTo(R.a_eff, 6);
  });

  it("plate bruker a_anch som foer", () => {
    const R = compute(DEFAULTS);
    expect(R.isPlate).toBe(true);
    expect(R.a_eff).toBeCloseTo(DEFAULTS.a_anch, 6);
    expect(R.T_nut).toBeCloseTo(41.8, 0);                        // med avledet e_h
  });

  it("mindre lastflate (mutter) gir stoerre spaltestrekk enn plate", () => {
    expect(compute({ ...DEFAULTS, anchor: "mutter" }).T_nut)
      .toBeGreaterThan(compute(DEFAULTS).T_nut);
  });

  it("'ingen' fjerner endelast: ingen endetrykk og ingen spaltestrekk derfra", () => {
    const R = compute({ ...DEFAULTS, anchor: "ingen" });
    expect(R.noAnchor).toBe(true);
    expect(R.T_nut).toBe(0);
    expect(R.F_Rdu).toBe(0);
    expect(R.u_bear).toBe(0);
    expect(R.u_bond).toBeGreaterThan(0);                         // heft styrer i stedet
  });
});

describe("compute() – heftforankring av stag (EC2 §8.4)", () => {
  const v: Inputs = { ...DEFAULTS, anchor: "ingen" };
  const R = compute(v), B = R.bond;

  it("eta_2 = 1,0 for phi <= 32 og (132-phi)/100 over", () => {
    expect(B.eta2).toBe(1);                                      // M30
    expect(compute({ ...v, boltsize: "M36" }).bond.eta2).toBeCloseTo(0.96, 6);
    expect(compute({ ...v, phi_v: 40 }).eta2_v).toBeCloseTo(0.92, 6);
  });

  it("l_b,rqd = (d/4)*(sigma_sd/f_bd)", () => {
    expect(B.sigma_sd).toBeCloseTo(v.N_t / v.n_bolt * 1000 / R.As_bolt, 4);
    expect(B.lb_rqd).toBeCloseTo(R.d_bolt / 4 * (B.sigma_sd / B.fbd), 4);
  });

  it("alfa-faktorene ligger i [0,7; 1,0] og l_bd >= l_b,min", () => {
    for (const a of [B.a2, B.a3, B.a5]) {
      expect(a).toBeGreaterThanOrEqual(0.7);
      expect(a).toBeLessThanOrEqual(1.0);
    }
    expect(B.a1).toBe(1);                                        // rett stang
    expect(B.lb_min).toBeCloseTo(Math.max(0.3 * B.lb_rqd, 10 * R.d_bolt, 100), 4);
    expect(B.lbd).toBeGreaterThanOrEqual(B.lb_min - 1e-6);
    expect(B.lbd).toBeCloseTo(
      Math.max(B.a1 * B.a2 * B.a3 * B.a4 * B.a5 * B.lb_rqd, B.lb_min), 1);
  });

  it("krok gir alfa_1 = 0,7 KUN naar c_d > 3*phi (tab. 8.2)", () => {
    // default: c_d = 85 mm < 3*30 = 90 -> ingen reduksjon, tross krok
    const tight = compute({ ...v, anch_shape: "krok" }).bond;
    expect(tight.cd).toBeLessThan(3 * 30);
    expect(tight.a1).toBe(1.0);
    // romsligere tverrsnitt og stagavstand -> c_d > 3*phi -> 0,7 slaar inn
    const roomy = compute({
      ...v, anch_shape: "krok", b: 600, h: 600, s_bolt_x: 240, s_bolt_y: 240,
    }).bond;
    expect(roomy.cd).toBeGreaterThan(3 * 30);
    expect(roomy.a1).toBe(0.7);
  });

  it("tverrtrykk og sveiset tverrarmering reduserer l_bd", () => {
    expect(compute({ ...v, p_tr: 5 }).bond.a5).toBeCloseTo(0.8, 6);
    expect(compute({ ...v, alpha4: 0.7 }).bond.lbd).toBeLessThan(B.lbd);
  });

  it("kontrollen er l_bd <= h_ef - c_nom", () => {
    expect(R.l_avail).toBeCloseTo(v.h_ef - R.c_nom, 6);
    expect(R.u_bond).toBeCloseTo(B.lbd / R.l_avail, 6);
    const deep = compute({ ...v, h_ef: 3000 });
    expect(deep.u_bond).toBeLessThan(1);
  });
});

describe("compute() – heftkoeffisient for gjengestang (BEB B19 19.3.4)", () => {
  const v: Inputs = { ...DEFAULTS, anchor: "ingen" };
  it("default k_bd = 1,90 gir f_bd = 1,077 * f_ctk,0,05", () => {
    expect(DEFAULTS.k_bd_bolt).toBe(1.9);
    const R = compute(v);
    expect(R.fbd_bolt).toBeCloseTo(1.077 * R.conc.fctk005, 2);   // 1,90*0,85/1,5 = 1,077
    expect(R.fbd_bolt / R.fbd).toBeCloseTo(1.9 / 2.25, 6);       // 0,84 av kamstaal
  });
  it("kamstaal (boyle/oppstikk) beholder 2,25", () => {
    const R = compute(v);
    expect(R.fbd).toBeCloseTo(2.25 * v.eta1 * R.eta2_v * R.fctd, 6);
    expect(R.fbd_b).toBeCloseTo(2.25 * v.eta1 * R.eta2_b * R.fctd, 6);
  });
  it("k_bd = 2,25 gir full kamstaalsverdi og kortere l_bd", () => {
    const full = compute({ ...v, k_bd_bolt: 2.25 });
    expect(full.fbd_bolt).toBeCloseTo(full.fbd, 6);
    expect(full.bond.lbd).toBeLessThan(compute(v).bond.lbd);
  });
});

describe("betongfastheter avledet av f_ck (EC2 tab. 3.1)", () => {
  it("C35 reproduserer tabellverdiene", () => {
    const c = concreteProps(35);
    expect(c.fcm).toBe(43);
    expect(c.fctm).toBeCloseTo(3.2, 1);
    expect(c.fctk005).toBeCloseTo(2.2, 1);      // tabell: 2,2
    expect(c.fctk095).toBeCloseTo(4.2, 1);      // tabell: 4,2
    expect(c.Ecm / 1000).toBeCloseTo(34, 0);    // tabell: 34 GPa
  });

  it("treffer tabell 3.1 for flere fasthetsklasser", () => {
    // [f_ck, f_ctm, f_ctk005, f_ctk095, E_cm(GPa)] fra NS-EN 1992-1-1 tabell 3.1
    const tab: [number, number, number, number, number][] = [
      [20, 2.2, 1.5, 2.9, 30],
      [25, 2.6, 1.8, 3.3, 31],
      [30, 2.9, 2.0, 3.8, 33],
      [40, 3.5, 2.5, 4.6, 35],
      [50, 4.1, 2.9, 5.3, 37],
      [60, 4.4, 3.1, 5.7, 39],   // over C50/60 -> logaritmisk uttrykk
      [70, 4.6, 3.2, 6.0, 41],
    ];
    for (const [fck, fctm, f05, f95, Ec] of tab) {
      const c = concreteProps(fck);
      // Tabell 3.1 er avrundet til 1 desimal, og fraktilene er dessuten regnet av det
      // AVRUNDEDE f_ctm (0,7*4,4 = 3,08 ~ 3,1 for C60, mot 3,05 uavrundet). Vi regner
      // ubrutt av formlene og godtar derfor avviket fra avrundingen: <= 0,06 MPa.
      expect(c.fctm, `f_ctm for C${fck}`).toBeCloseTo(fctm, 1);
      expect(Math.abs(c.fctk005 - f05), `f_ctk,0.05 for C${fck}`).toBeLessThanOrEqual(0.06);
      expect(Math.abs(c.fctk095 - f95), `f_ctk,0.95 for C${fck}`).toBeLessThanOrEqual(0.06);
      expect(c.Ecm / 1000, `E_cm for C${fck}`).toBeCloseTo(Ec, 0);
    }
  });

  it("f_ctd foelger f_ck automatisk - ingen egen inndata", () => {
    expect(DEFAULTS).not.toHaveProperty("fctk");
    const R35 = compute(DEFAULTS), R45 = compute({ ...DEFAULTS, fck: 45 });
    expect(R35.fctd).toBeCloseTo(DEFAULTS.a_ct * R35.conc.fctk005 / DEFAULTS.g_c, 9);
    expect(R45.conc.fctk005).toBeGreaterThan(R35.conc.fctk005);
    expect(R45.fctd).toBeGreaterThan(R35.fctd);   // hoyere klasse -> hoyere heft
    expect(R45.fbd).toBeGreaterThan(R35.fbd);
  });
});

describe("stagmoensteret maa faa plass i tverrsnittet", () => {
  it("default (4 stag) har god overdekning", () => {
    const R = compute(DEFAULTS);
    expect(R.c_bolt).toBeCloseTo(DEFAULTS.b / 2 - DEFAULTS.s_bolt_x / 2 - R.d_bolt / 2, 6);
    expect(R.boltFits).toBe(true);
  });
  it("6 stag med samme s_bolt sprenger tverrsnittet -> ikke OK", () => {
    const R = compute({ ...DEFAULTS, n_bolt: 6 });
    expect(R.boltXY.length).toBe(6);
    expect(R.c_bolt).toBeLessThan(R.c_nom);   // stagene naar betongflaten
    expect(R.boltFits).toBe(false);
    expect(R.allOk).toBe(false);                     // slaar ut i totalvurderingen
  });
  it("stoerre tverrsnitt eller tettere moenster gjoer det OK igjen", () => {
    expect(compute({ ...DEFAULTS, n_bolt: 6, b: 700, h: 700 }).boltFits).toBe(true);
    expect(compute({ ...DEFAULTS, n_bolt: 6, s_bolt_x: 110, s_bolt_y: 110 }).boltFits).toBe(true);
  });
});

describe("alfa-produktet er en nedre grense, ikke en kontroll (EC2 8.5)", () => {
  // Hver alfa klemmes for seg til [0,7; 1,0], saa produktet kommer under 0,7 foerst
  // naar TO av dem ligger i bunn: stor overdekning (a2=0,7) + hoyt tverrtrykk (a5=0,7).
  const v: Inputs = {
    ...DEFAULTS, anchor: "ingen", b: 800, h: 800, boltsize: "M20",
    s_bolt_x: 200, s_bolt_y: 200, p_tr: 8,
  };
  it("produktet klemmes opp til 0,70 naar det raa produktet er lavere", () => {
    const B = compute(v).bond;
    expect(B.alphaProdRaw).toBeLessThan(0.7);
    expect(B.prodFloored).toBe(true);
    expect(B.alphaProd).toBeCloseTo(0.7, 9);
  });
  it("l_bd bruker det klemte produktet, ikke det raa", () => {
    const B = compute(v).bond;
    expect(B.lbd).toBeCloseTo(
      Math.max(B.a1 * B.a4 * B.alphaProd * B.lb_rqd, B.lb_min), 6);
    // det raa produktet ville gitt kortere - altsaa unnagjort paa feil side
    expect(B.a1 * B.a4 * B.alphaProdRaw * B.lb_rqd).toBeLessThan(B.a1 * B.a4 * B.alphaProd * B.lb_rqd);
  });
  it("uendret naar produktet allerede er over 0,70", () => {
    const B = compute({ ...DEFAULTS, anchor: "ingen" }).bond;
    expect(B.prodFloored).toBe(false);
    expect(B.alphaProd).toBeCloseTo(B.alphaProdRaw, 9);
  });
});

describe("boltavstand kan variere ⊥V og ∥V", () => {
  it("moensteret foelger de to senteravstandene hver for seg", () => {
    const v: Inputs = { ...DEFAULTS, n_bolt: 4, s_bolt_x: 120, s_bolt_y: 260 };
    const p = compute(v).boltXY;
    expect(new Set(p.map(([x]) => Math.abs(x))).size).toBe(1);
    expect(Math.abs(p[0][0])).toBeCloseTo(60, 6);    // 120/2 paa tvers
    expect(Math.abs(p[0][1])).toBeCloseTo(130, 6);   // 260/2 langs
  });
  it("overdekningen maales mot rett retning i hver akse", () => {
    const v: Inputs = { ...DEFAULTS, s_bolt_x: 120, s_bolt_y: 300 };
    const R = compute(v);
    expect(R.bond.c_side).toBeCloseTo(v.b / 2 - 60 - R.d_bolt / 2, 6);
    expect(R.bond.c_edge).toBeCloseTo(v.h / 2 - 150 - R.d_bolt / 2, 6);
  });
  it("for stor avstand langs V sprenger tverrsnittet", () => {
    expect(compute({ ...DEFAULTS, s_bolt_y: 400 }).boltFits).toBe(false);
    expect(compute({ ...DEFAULTS, s_bolt_y: 200 }).boltFits).toBe(true);
  });
});

describe("overfoering stag -> oppstikk og noedvendig innstoping", () => {
  it("sigma_sd fordeler strekket paa ALLE oppstikkene, ikke ett per stag", () => {
    const R = compute(DEFAULTS);
    expect(R.sig_sd).toBeCloseTo(DEFAULTS.N_t * 1000 / (R.n_v_eff * R.A_v1), 6);
    // samme grunnlag som N_Rd,v -> utnyttelsen stemmer med spenningen
    expect(R.sig_sd / R.fyd).toBeCloseTo(R.u_ax, 6);
    // dobbelt saa mange oppstikk halverer spenningen
    expect(compute({ ...DEFAULTS, n_v: 16 }).sig_sd).toBeCloseTo(R.sig_sd / 2, 0);
  });

  it("endeforankring gir FORANKRING av oppstikkene, ingen omfaring", () => {
    for (const anchor of ["plate", "mutter"] as const) {
      const R = compute({ ...DEFAULTS, anchor });
      expect(R.l_trans).toBeCloseTo(R.lbd_v, 6);
      expect(R.l_trans).toBeLessThan(R.l0);
    }
  });

  it("uten endeforankring maa kraften skjoetes over -> omfaring l_0", () => {
    const R = compute({ ...DEFAULTS, anchor: "ingen" });
    expect(R.l_trans).toBeCloseTo(R.l0, 6);
    expect(R.h_ef_req).toBeGreaterThan(compute(DEFAULTS).h_ef_req);
  });

  it("h_ef,nodv = spredning + overfoering + overdekning", () => {
    const R = compute(DEFAULTS);
    expect(R.h_ef_req).toBeCloseTo(R.l_spread + R.l_trans + R.c_nom, 6);
  });

  it("l_0 foelger §8.7.3 med alfa-faktorer og 15*phi som minimum", () => {
    const R = compute(DEFAULTS);
    expect(R.l0).toBeGreaterThanOrEqual(15 * DEFAULTS.phi_v);
    expect(R.lbd_v).toBeGreaterThanOrEqual(10 * DEFAULTS.phi_v);
    expect(R.l0).toBeGreaterThan(R.lbd_v);          // omfaring er alltid lengst
  });

  it("500 kN med ankerplate krever ikke lenger urimelig innstoping", () => {
    const R = compute({ ...DEFAULTS, N_t: 500 });
    expect(R.h_ef_req).toBeLessThan(400);           // var over 900 mm foer
  });
});

describe("skjoet mellom stag og oppstikk som ikke ligger inntil hverandre (§8.7.2(3))", () => {
  it("fri avstand maales mellom overflatene, ikke senter-senter", () => {
    const R = compute(DEFAULTS);
    expect(R.lapClear).toBeCloseTo(R.e_h - R.d_bolt / 2 - DEFAULTS.phi_v / 2, 6);
    expect(R.lapClearLim).toBe(Math.max(4 * DEFAULTS.phi_v, 50));
  });

  it("intet tillegg naar avstanden er under grensa", () => {
    const R = compute({ ...DEFAULTS, anchor: "ingen" });
    expect(R.lapClear).toBeLessThan(R.lapClearLim);   // 16 mm mot 100 mm
    expect(R.lapExtra).toBe(0);
  });

  it("over grensa oekes omfaringen med hele den frie avstanden", () => {
    const v = { ...DEFAULTS, anchor: "ingen" as const, b: 800, h: 800 };
    const R = compute(v);
    expect(R.lapClear).toBeGreaterThan(R.lapClearLim);
    expect(R.lapExtra).toBeCloseTo(R.lapClear, 6);
    // tillegget ligger faktisk i l_0 og dermed i noedvendig innstoping
    const uten = compute({ ...v, phi_v: 60 });        // 4*60 = 240 > fri avstand -> ingen tillegg
    expect(uten.lapExtra).toBe(0);
    expect(R.h_ef_req).toBeGreaterThan(500);
  });

  it("aa flytte oppstikkene naermere stagene forkorter omfaringen", () => {
    const wide = { ...DEFAULTS, anchor: "ingen" as const, b: 800, h: 800 };
    const far = compute(wide);
    // stoerre boltavstand -> stagene naermere hjornejernene -> mindre fri avstand
    const near = compute({ ...wide, s_bolt_x: 500, s_bolt_y: 500 });
    expect(near.e_h).toBeLessThan(far.e_h);
    expect(near.lapExtra).toBeLessThan(far.lapExtra);
    expect(near.h_ef_req).toBeLessThan(far.h_ef_req);
  });

  it("tillegget gjelder KUN naar det finnes en skjoet", () => {
    const v = { b: 800, h: 800 };
    const ingen = compute({ ...DEFAULTS, ...v, anchor: "ingen" });
    const plate = compute({ ...DEFAULTS, ...v, anchor: "plate" });
    expect(ingen.lapExtra).toBeGreaterThan(0);
    expect(plate.l_trans).toBe(plate.lbd_v);          // forankring, ikke omfaring
    expect(plate.h_ef_req).toBeLessThan(ingen.h_ef_req);
  });
});
