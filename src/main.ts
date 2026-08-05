import { DEFAULTS, compute, BOLT_SIZES, GRADES, type Inputs } from "./calc";
import { buildModel, type ElementSpec } from "./model";
import { Viewer } from "./viewer";
import { exportIFC } from "./ifc";

const v: Inputs = { ...DEFAULTS };

// hvilke input som vises i panelet (resten holdes paa default)
type Field = { k: keyof Inputs; label: string; kind?: "sel" | "bool"; opts?: string[] };
const FIELDS: { sec: string; items: Field[] }[] = [
  { sec: "Geometri [mm]", items: [
    { k: "H_pil", label: "Pilasterhøyde" }, { k: "H_wall", label: "Ringmurhøyde" },
    { k: "b", label: "Bredde b (⊥V)" }, { k: "h", label: "Dybde h (∥V)" },
    { k: "t_wall", label: "Ringmurtykkelse" }, { k: "a1p", label: "Bunnplate a₁" },
    { k: "s_bolt", label: "Boltavstand" }, { k: "e_h", label: "e_h stag→jern" },
    { k: "h_ef", label: "Innstøping h_ef" }, { k: "c_nom", label: "Overdekning" } ] },
  { sec: "Bolter", items: [
    { k: "boltsize", label: "Boltdimensjon", kind: "sel", opts: Object.keys(BOLT_SIZES) },
    { k: "grade", label: "Fasthetsklasse", kind: "sel", opts: GRADES },
    { k: "anchor", label: "Endeforankring", kind: "sel", opts: ["mutter", "plate"] },
    { k: "a_anch", label: "Ende/plate a₁" }, { k: "t_pl", label: "Platetykkelse" } ] },
  { sec: "Armering", items: [
    { k: "phi_b", label: "Bøyle Ø" }, { k: "s_b", label: "Bøyleavstand" },
    { k: "phi_v", label: "Oppstikk Ø" }, { k: "n_v", label: "Antall oppstikk" } ] },
  { sec: "Skjærnokk", items: [
    { k: "use_lug", label: "Bruk skjærnokk", kind: "bool" },
    { k: "w_lug", label: "Nokkbredde" }, { k: "h_emb", label: "Nokkhøyde" } ] },
  { sec: "Laster [kN]", items: [
    { k: "N_t", label: "Aksial strekk" }, { k: "N_c", label: "Aksial trykk" }, { k: "V", label: "Skjær" } ] },
];

const $ = (s: string) => document.querySelector(s)!;
const canvas = $("#c") as HTMLCanvasElement;
const viewer = new Viewer(canvas);
let els: ElementSpec[] = [];
const shown = new Set(["concrete", "rebar-stirrup", "rebar-bar", "steel", "bolt", "lug"]);

function renderInputs() {
  const host = $("#inputs"); host.innerHTML = "";
  for (const grp of FIELDS) {
    const s = document.createElement("div"); s.className = "sec"; s.textContent = grp.sec; host.appendChild(s);
    for (const f of grp.items) {
      const row = document.createElement("div");
      row.className = "row" + (f.kind === "bool" ? " check" : "");
      const lab = document.createElement("label"); lab.textContent = f.label; row.appendChild(lab);
      let ctrl: HTMLElement;
      if (f.kind === "sel") {
        const sel = document.createElement("select");
        for (const o of f.opts!) { const op = document.createElement("option"); op.value = o; op.textContent = o; if (v[f.k] === o) op.selected = true; sel.appendChild(op); }
        sel.onchange = () => { (v as any)[f.k] = sel.value; refresh(); };
        ctrl = sel;
      } else if (f.kind === "bool") {
        const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!v[f.k];
        cb.onchange = () => { (v as any)[f.k] = cb.checked; refresh(); };
        ctrl = cb;
      } else {
        const inp = document.createElement("input"); inp.type = "number"; inp.step = "any"; inp.value = String(v[f.k]);
        inp.oninput = () => { (v as any)[f.k] = parseFloat(inp.value) || 0; refresh(); };
        ctrl = inp;
      }
      row.appendChild(ctrl); host.appendChild(row);
    }
  }
}

const LEG: [string, string, number][] = [
  ["concrete", "Betong", 0xb8b4a8], ["rebar-stirrup", "Bøyler", 0x2a78d6],
  ["rebar-bar", "Oppstikk Ø25", 0x1baf7a], ["steel", "Plater/søyle", 0x8a8f98],
  ["bolt", "Gjengestag", 0x55585e], ["lug", "Skjærnokk", 0xd95926],
];
function renderToggles() {
  const t = $("#toggles"); t.innerHTML = "<div style='font-weight:700;margin-bottom:4px'>Vis</div>";
  for (const [mat, name] of LEG) {
    const l = document.createElement("label");
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = shown.has(mat);
    cb.onchange = () => { cb.checked ? shown.add(mat) : shown.delete(mat); viewer.setModel(els, (m) => shown.has(m)); };
    l.appendChild(cb); l.appendChild(document.createTextNode(" " + name)); t.appendChild(l);
  }
  $("#legend").innerHTML = LEG.map(([, n, hex]) =>
    `<div class="li"><span class="sw" style="background:#${hex.toString(16).padStart(6, "0")}"></span>${n}</div>`).join("");
}

function renderResults() {
  const R = compute(v);
  const u = (x: number) => `<span class="${x <= 1 ? "ok" : "bad"}">${x.toFixed(2)}</span>`;
  const rows: [string, string][] = [
    ["Bøylestrekk N_Ed,re", `${R.N_re.toFixed(0)} kN`],
    ["Kapasitet N_Rd,re", `${R.N_Rd_re.toFixed(0)} kN`],
    ["Maks bøyleavstand", `${R.s_b_max.toFixed(0)} mm`],
    ["Omfaring l₀", `${R.l0.toFixed(0)} mm`],
    ["Nødv. innstøping", `${R.h_ef_req.toFixed(0)} mm`],
    ["Utn. bøyler", u(R.u_stal)], ["Utn. innstøping", u(R.u_emb)],
    ["Utn. endetrykk", u(R.u_bear)], ["Utn. aksial 8Ø25", u(R.u_ax)],
  ];
  $("#results").innerHTML =
    `<div class="r"><b>Status</b><b class="${R.allOk ? "ok" : "bad"}">${R.allOk ? "OK" : "IKKE OK"}</b></div>` +
    rows.map(([a, b]) => `<div class="r"><span>${a}</span><span>${b}</span></div>`).join("");
}

function refresh() {
  const R = compute(v);
  els = buildModel(v, R);
  viewer.setModel(els, (m) => shown.has(m));
  renderResults();
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const setStatus = (s: string) => ($("#status").textContent = s);

($("#btnIfc") as HTMLButtonElement).onclick = async () => {
  setStatus("bygger IFC…");
  try {
    const R = compute(v);
    const blob = await exportIFC(buildModel(v, R), R, v);
    download(blob, "pilaster.ifc"); setStatus(`IFC eksportert (${(blob.size / 1024).toFixed(0)} kB)`);
  } catch (e: any) { setStatus("IFC-feil: " + e.message); console.error(e); }
};
($("#btnGlb") as HTMLButtonElement).onclick = async () => {
  setStatus("bygger GLB…");
  const blob = await viewer.exportGLB(); download(blob, "pilaster.glb"); setStatus("GLB eksportert");
};
($("#btnFit") as HTMLButtonElement).onclick = () => viewer.fitView();

renderInputs(); renderToggles(); refresh(); viewer.fitView(); setStatus("klar");
(window as any).__pilaster = { v, compute, buildModel };
