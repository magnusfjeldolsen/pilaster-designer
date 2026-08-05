// IFC4-autoring med web-ifc. Bygger fra samme ElementSpec som three.js-visningen.
// Boks -> IfcExtrudedAreaSolid (rektangelprofil). Sveip -> IfcSweptDiskSolid (polylinje-directrix).
import * as WebIFC from "web-ifc";
import type { ElementSpec, Vec3 } from "./model";
import type { Inputs, Results } from "./calc";

const IFC4 = (WebIFC as any).IFC4;
const Handle = (WebIFC as any).Handle;

let apiPromise: Promise<any> | null = null;
async function getApi(): Promise<any> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = new (WebIFC as any).IfcAPI();
      api.SetWasmPath("./", false);           // web-ifc.wasm servert fra site-rot (public/)
      await api.Init(undefined, true);         // single-thread -> ingen COOP/COEP-krav
      return api;
    })();
  }
  return apiPromise;
}

export async function exportIFC(els: ElementSpec[], R: Results, v: Inputs): Promise<Blob> {
  const api = await getApi();
  const model = api.CreateModel({
    schema: (WebIFC as any).Schemas.IFC4,
    name: "pilaster.ifc",
    description: ["ViewDefinition [ReferenceView_V1.2]"],
    authors: ["pilaster-3d"], organizations: [], authorization: "",
  });

  let id = 1;
  const add = <T,>(e: T): any => { (e as any).expressID = id++; api.WriteLine(model, e); return new Handle((e as any).expressID); };
  // verdi-typer
  const Lbl = (s: string) => new IFC4.IfcLabel(s);
  const Txt = (s: string) => new IFC4.IfcText(s);
  const Idf = (s: string) => new IFC4.IfcIdentifier(s);
  const Len = (x: number) => new IFC4.IfcLengthMeasure(x);
  const PLen = (x: number) => new IFC4.IfcPositiveLengthMeasure(x);
  const Real = (x: number) => new IFC4.IfcReal(x);
  const NRatio = (x: number) => new IFC4.IfcNormalisedRatioMeasure(x);
  const guid = () => api.CreateIFCGloballyUniqueId(model);

  // geometri-primitiver
  const pt3 = (p: Vec3) => add(new IFC4.IfcCartesianPoint([Len(p[0]), Len(p[1]), Len(p[2])]));
  const pt2 = (x: number, y: number) => add(new IFC4.IfcCartesianPoint([Len(x), Len(y)]));
  const dir = (d: number[]) => add(new IFC4.IfcDirection(d));
  const dirZ = dir([0, 0, 1]), dirX = dir([1, 0, 0]);
  const axis3 = (p: Vec3) => add(new IFC4.IfcAxis2Placement3D(pt3(p), dirZ, dirX));

  // ---- prosjekt / kontekst / enheter ----
  const person = add(new IFC4.IfcPerson(null, Lbl("RIB"), null, null, null, null, null, null));
  const org = add(new IFC4.IfcOrganization(null, Lbl("pilaster-3d"), null, null, null));
  const pAndO = add(new IFC4.IfcPersonAndOrganization(person, org, null));
  const app = add(new IFC4.IfcApplication(org, Lbl("0.1.0"), Lbl("pilaster-3d"), Idf("pilaster-3d")));
  const owner = add(new IFC4.IfcOwnerHistory(pAndO, app, null, "ADDED", null, pAndO, app, Math.floor(Date.now() / 1000)));

  const mm = add(new IFC4.IfcSIUnit("LENGTHUNIT", "MILLI", "METRE"));
  const m2 = add(new IFC4.IfcSIUnit("AREAUNIT", null, "SQUARE_METRE"));
  const rad = add(new IFC4.IfcSIUnit("PLANEANGLEUNIT", null, "RADIAN"));
  const units = add(new IFC4.IfcUnitAssignment([mm, m2, rad]));

  const wcs = add(new IFC4.IfcAxis2Placement3D(pt3([0, 0, 0]), dirZ, dirX));
  const ctx = add(new IFC4.IfcGeometricRepresentationContext(null, Lbl("Model"), new IFC4.IfcDimensionCount(3), Real(1e-5), wcs, null));
  const body = add(new IFC4.IfcGeometricRepresentationSubContext(Lbl("Body"), Lbl("Model"), ctx, null, "MODEL_VIEW", null));

  const project = add(new IFC4.IfcProject(guid(), owner, Lbl("Pilaster - innfesting stalsoyle"), Txt("Konseptmodell NS-EN 1992-4"), null, null, null, [ctx], units));

  // ---- romlig struktur ----
  const worldPl = add(new IFC4.IfcLocalPlacement(null, add(new IFC4.IfcAxis2Placement3D(pt3([0, 0, 0]), dirZ, dirX))));
  const site = add(new IFC4.IfcSite(guid(), owner, Lbl("Tomt"), null, null, worldPl, null, null, "ELEMENT", null, null, Len(0), null, null));
  const building = add(new IFC4.IfcBuilding(guid(), owner, Lbl("Bygg"), null, null, worldPl, null, null, "ELEMENT", null, null, null));
  const storey = add(new IFC4.IfcBuildingStorey(guid(), owner, Lbl("Fundamentnivaa"), null, null, worldPl, null, null, "ELEMENT", Len(0)));
  add(new IFC4.IfcRelAggregates(guid(), owner, null, null, project, [site]));
  add(new IFC4.IfcRelAggregates(guid(), owner, null, null, site, [building]));
  add(new IFC4.IfcRelAggregates(guid(), owner, null, null, building, [storey]));

  // ---- solid-byggere ----
  const boxSolid = (size: Vec3, center: Vec3) => {
    const [dx, dy, dz] = size, [cx, cy, cz] = center;
    const prof = add(new IFC4.IfcRectangleProfileDef("AREA", null, add(new IFC4.IfcAxis2Placement2D(pt2(0, 0), dir([1, 0]))), PLen(dx), PLen(dy)));
    return add(new IFC4.IfcExtrudedAreaSolid(prof, axis3([cx, cy, cz - dz / 2]), dirZ, PLen(dz)));
  };
  const sweepSolid = (radius: number, path: Vec3[]) => {
    const poly = add(new IFC4.IfcPolyline(path.map((p) => pt3(p))));
    return add(new IFC4.IfcSweptDiskSolid(poly, PLen(radius), null, null, null));
  };
  // Vilkaarlig lukket profil (sekskantmutter) -> ekstrudert solid.
  // IfcPolyline for en lukket profil maa gjenta foerste punkt til slutt.
  const prismSolid = (profile: [number, number][], z0: number, z1: number) => {
    const pts = [...profile, profile[0]].map(([x, y]) => pt2(x, y));
    const prof = add(new IFC4.IfcArbitraryClosedProfileDef("AREA", null, add(new IFC4.IfcPolyline(pts))));
    return add(new IFC4.IfcExtrudedAreaSolid(prof, axis3([0, 0, z0]), dirZ, PLen(Math.max(z1 - z0, 0.001))));
  };
  const style = (solid: any, rgb: Vec3, opacity: number) => {
    const col = add(new IFC4.IfcColourRgb(null, NRatio(rgb[0]), NRatio(rgb[1]), NRatio(rgb[2])));
    const shading = add(new IFC4.IfcSurfaceStyleShading(col, NRatio(1 - opacity)));
    const ss = add(new IFC4.IfcSurfaceStyle(null, "BOTH", [shading]));
    add(new IFC4.IfcStyledItem(solid, [ss], null));
  };

  // ---- produkter ----
  const productHandles: any[] = [];
  const makeProduct = (e: ElementSpec) => {
    const solid = e.geom.kind === "box" ? boxSolid(e.geom.size, e.geom.center)
      : e.geom.kind === "prism" ? prismSolid(e.geom.profile, e.geom.z0, e.geom.z1)
      : sweepSolid(e.geom.radius, e.geom.path);
    style(solid, e.rgb, e.opacity);
    const repType = e.geom.kind === "sweep" ? "AdvancedSweptSolid" : "SweptSolid";
    const shape = add(new IFC4.IfcShapeRepresentation(body, Lbl("Body"), Lbl(repType), [solid]));
    const pds = add(new IFC4.IfcProductDefinitionShape(null, null, [shape]));
    const pl = add(new IFC4.IfcLocalPlacement(worldPl, add(new IFC4.IfcAxis2Placement3D(pt3([0, 0, 0]), dirZ, dirX))));
    const g = guid(), nm = Lbl(e.name);
    let prod: any;
    switch (e.ifcClass) {
      case "IfcColumn": prod = new IFC4.IfcColumn(g, owner, nm, null, null, pl, pds, Idf(e.id), "COLUMN"); break;
      case "IfcWall": prod = new IFC4.IfcWall(g, owner, nm, null, null, pl, pds, Idf(e.id), "STANDARD"); break;
      case "IfcFooting": prod = new IFC4.IfcFooting(g, owner, nm, null, null, pl, pds, Idf(e.id), "PAD_FOOTING"); break;
      case "IfcPlate": prod = new IFC4.IfcPlate(g, owner, nm, null, null, pl, pds, Idf(e.id), "NOTDEFINED"); break;
      case "IfcMember": prod = new IFC4.IfcMember(g, owner, nm, null, null, pl, pds, Idf(e.id), "COLUMN"); break;
      case "IfcReinforcingBar": {
        const rad2 = (e.geom.kind === "sweep" ? e.geom.radius : 6);
        prod = new IFC4.IfcReinforcingBar(g, owner, nm, null, null, pl, pds, Idf(e.id),
          Lbl("B500NC"), PLen(2 * rad2), null, null, e.material === "rebar-stirrup" ? "LIGATURE" : "ANCHORING", "TEXTURED");
        break;
      }
      case "IfcMechanicalFastener":
        prod = new IFC4.IfcMechanicalFastener(g, owner, nm, null, null, pl, pds, Idf(e.id), PLen(R.d_bolt), null, "ANCHORBOLT");
        break;
      default: prod = new IFC4.IfcPlate(g, owner, nm, null, null, pl, pds, Idf(e.id), "NOTDEFINED");
    }
    productHandles.push(add(prod));
  };
  els.forEach(makeProduct);
  add(new IFC4.IfcRelContainedInSpatialStructure(guid(), owner, null, null, productHandles, storey));

  // ---- Pset med beregningsresultater (til fabrikant) ----
  const psv = (name: string, val: any) => add(new IFC4.IfcPropertySingleValue(Idf(name), null, val, null));
  const props = [
    psv("N_Ed_t_kN", Real(v.N_t)), psv("N_Ed_c_kN", Real(v.N_c)), psv("V_Ed_kN", Real(v.V)),
    psv("Boltklasse", Lbl(`${v.boltsize} ${v.grade}`)),
    psv("N_Ed_re_kN", Real(+R.N_re.toFixed(1))), psv("N_Rd_re_kN", Real(+R.N_Rd_re.toFixed(1))),
    psv("s_b_maks_mm", Real(+R.s_b_max.toFixed(0))), psv("n_lag", new IFC4.IfcInteger(R.n_lag)),
    psv("l0_mm", Real(+R.l0.toFixed(0))), psv("h_ef_nodv_mm", Real(+R.h_ef_req.toFixed(0))),
    psv("Utnytt_boyler", Real(+R.u_stal.toFixed(2))), psv("Utnytt_innstoping", Real(+R.u_emb.toFixed(2))),
    psv("Alt_OK", new IFC4.IfcBoolean(R.allOk)),
  ];
  const pset = add(new IFC4.IfcPropertySet(guid(), owner, Lbl("Pset_PilasterKonsept_EC2"), Txt("NS-EN 1992-4 resultater"), props));
  add(new IFC4.IfcRelDefinesByProperties(guid(), owner, null, null, [project, ...productHandles.slice(0, 3)], pset));

  const bytes: Uint8Array = api.SaveModel(model);
  api.CloseModel(model);
  const buf = bytes.slice().buffer as ArrayBuffer;
  return new Blob([buf], { type: "application/x-step" });
}
