import { describe, it, expect } from "vitest";
import { compute, DEFAULTS } from "./calc";
import { buildModel } from "./model";

describe("buildModel()", () => {
  it("gir forventet antall elementer (uten nokk)", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    // footing+wall+pilaster(3) + baseplate+stubbe(2) + 4 stag + 4 plate + 8 oppstikk + 5 boyler = 26
    expect(els.length).toBe(26);
    expect(els.filter((e) => e.ifcClass === "IfcReinforcingBar").length).toBe(13);
    expect(els.filter((e) => e.ifcClass === "IfcMechanicalFastener").length).toBe(4);
    expect(els.filter((e) => e.ifcClass === "IfcPlate").length).toBe(5); // bunnplate + 4 ankerplater
  });
  it("skjaernokk legger til ett element", () => {
    const els = buildModel({ ...DEFAULTS, use_lug: true }, compute({ ...DEFAULTS, use_lug: true }));
    expect(els.some((e) => e.material === "lug")).toBe(true);
    expect(els.length).toBe(27);
  });
  it("mutter gir fastener i stedet for plate paa endeforankring", () => {
    const els = buildModel({ ...DEFAULTS, anchor: "mutter" }, compute({ ...DEFAULTS, anchor: "mutter" }));
    // bunnplate (1) er eneste plate; 4 muttere er fasteners sammen med 4 stag = 8
    expect(els.filter((e) => e.ifcClass === "IfcPlate").length).toBe(1);
    expect(els.filter((e) => e.ifcClass === "IfcMechanicalFastener").length).toBe(8);
  });
  it("boyle-directrix er AAPEN (krok-glipe) -> swept-disk bygger i alle kjerner", () => {
    const els = buildModel(DEFAULTS, compute(DEFAULTS));
    const st = els.find((e) => e.material === "rebar-stirrup")!;
    expect(st.geom.kind).toBe("sweep");
    if (st.geom.kind === "sweep") {
      const p = st.geom.path;
      const first = p[0], last = p[p.length - 1];
      const same = first[0] === last[0] && first[1] === last[1] && first[2] === last[2];
      expect(same).toBe(false); // start != slutt (aapen boyle)
    }
  });
});
