import { DEFAULTS, compute, BOLT_SIZES, GRADES, type Inputs, type Results } from "./calc";
import { buildModel, type ElementSpec } from "./model";
import { Viewer } from "./viewer";
import { exportIFC } from "./ifc";
import {
  INPUT_GROUPS, SYM, buildReport, ASSUMPTIONS_HTML, type InputMeta, type DocGroup,
} from "./report";
import { drawPlan, drawSection, MECHS, MECH_TEXT, type Mech } from "./sketch";

const v: Inputs = { ...DEFAULTS };
const $ = (s: string) => document.querySelector(s)!;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** N_Ed,t -> N med subscript, likt rapportens symbolsetting. */
const pretty = (sym: string) => {
  const m = sym.match(/^([^_]+)_?(.*)$/);
  return m && m[2] ? `${esc(m[1])}<sub>${esc(m[2].replace(/_/g, ","))}</sub>` : esc(sym);
};

const canvas = $("#c") as HTMLCanvasElement;
const viewer = new Viewer(canvas);
let els: ElementSpec[] = [];
let R: Results = compute(v);
const shown = new Set(["concrete", "rebar-stirrup", "rebar-bar", "steel", "bolt", "lug"]);
let tab: "3d" | "2d" | "doc" = "3d";
let mech: Mech = "shear";

/* ---------------- inputpanel (drevet av INPUT_GROUPS) ---------------- */
function optsFor(f: InputMeta): string[] {
  if (f.opts) return f.opts;
  if (f.k === "boltsize") return Object.keys(BOLT_SIZES);
  if (f.k === "grade") return GRADES;
  return [];
}

function renderInputs() {
  const host = $("#inputs"); host.innerHTML = "";
  for (const grp of INPUT_GROUPS) {
    const s = document.createElement("div");
    s.className = "sec"; s.textContent = grp.title; host.appendChild(s);
    for (const f of grp.items) {
      const row = document.createElement("div");
      row.className = "row" + (f.kind === "bool" ? " check" : "");
      const lab = document.createElement("label");
      lab.textContent = f.label;
      lab.title = `${SYM[f.k as string] ?? f.k} — ${f.cmt}${f.unit ? ` [${f.unit}]` : ""}`;
      row.appendChild(lab);
      let ctrl: HTMLElement;
      if (f.kind === "sel") {
        const sel = document.createElement("select");
        for (const o of optsFor(f)) {
          const op = document.createElement("option");
          op.value = o; op.textContent = o;
          if (v[f.k] === o) op.selected = true;
          sel.appendChild(op);
        }
        sel.onchange = () => { (v as any)[f.k] = sel.value; refresh(); };
        ctrl = sel;
      } else if (f.kind === "bool") {
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = !!v[f.k];
        cb.onchange = () => { (v as any)[f.k] = cb.checked; refresh(); };
        ctrl = cb;
      } else {
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = "any"; inp.value = String(v[f.k]);
        inp.title = f.unit;
        inp.oninput = () => { (v as any)[f.k] = parseFloat(inp.value) || 0; refresh(); };
        ctrl = inp;
      }
      row.appendChild(ctrl); host.appendChild(row);
    }
  }
}

/* ---------------- 3D-toggles ---------------- */
const LEG: [string, string, number][] = [
  ["concrete", "Betong", 0xb8b4a8], ["rebar-stirrup", "Bøyler", 0x2a78d6],
  ["rebar-bar", "Oppstikk", 0x1baf7a], ["steel", "Plater/søyle", 0x8a8f98],
  ["bolt", "Gjengestag", 0x55585e], ["lug", "Skjærnokk", 0xd95926],
];
function renderToggles() {
  const t = $("#toggles"); t.innerHTML = "<div style='font-weight:700;margin-bottom:4px'>Vis</div>";
  for (const [mat, name] of LEG) {
    const l = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = shown.has(mat);
    cb.onchange = () => {
      cb.checked ? shown.add(mat) : shown.delete(mat);
      viewer.setModel(els, (m) => shown.has(m));
    };
    l.appendChild(cb); l.appendChild(document.createTextNode(" " + name)); t.appendChild(l);
  }
  $("#legend").innerHTML = LEG.map(([, n, hex]) =>
    `<div class="li"><span class="sw" style="background:#${hex.toString(16).padStart(6, "0")}"></span>${n}</div>`).join("");
}

/* ---------------- sammendrag i panelet ---------------- */
function renderResults() {
  const u = (x: number) => `<span class="${x <= 1 ? "ok" : "bad"}">${x.toFixed(2)}</span>`;
  const rows: [string, string][] = [
    ["Bøylestrekk N_Ed,re", `${R.N_re.toFixed(0)} kN`],
    ["Kapasitet N_Rd,re", `${R.N_Rd_re.toFixed(0)} kN`],
    ["Maks bøyleavstand", `${R.s_b_max.toFixed(0)} mm`],
    ["Omfaring l₀", `${R.l0.toFixed(0)} mm`],
    ["Nødv. innstøping", `${R.h_ef_req.toFixed(0)} mm`],
    ["Utn. bøyler", u(R.u_stal)], ["Utn. innstøping", u(R.u_emb)],
    ["Utn. endetrykk", u(R.u_bear)], ["Utn. aksial", u(R.u_ax)],
  ];
  $("#results").innerHTML =
    `<div class="r"><b>Status</b><b class="${R.allOk ? "ok" : "bad"}">${R.allOk ? "OK" : "IKKE OK"}</b></div>` +
    rows.map(([a, b]) => `<div class="r"><span>${a}</span><span>${b}</span></div>`).join("");
}

/* ---------------- 2D ---------------- */
function renderMechbar() {
  $("#mechbar").innerHTML = MECHS.map((m) =>
    `<button data-m="${m.id}" aria-pressed="${m.id === mech}" style="color:${m.id === mech ? m.color : ""}">` +
    `<span class="dot" style="background:${m.color}"></span>${m.label}</button>`).join("");
  $("#mechbar").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      mech = (b as HTMLElement).dataset.m as Mech;
      renderMechbar(); render2d();
    }));
}
function render2d() {
  $("#mechtext").innerHTML = MECH_TEXT[mech];
  $("#figs2d").innerHTML =
    `<div class="fig">${drawPlan(v, R, mech)}</div><div class="fig">${drawSection(v, R, mech)}</div>`;
}

/* ---------------- beregningsrapport ---------------- */
function fmtVal(k: keyof Inputs): string {
  const x = v[k];
  if (typeof x === "boolean") return x ? "ja" : "nei";
  if (typeof x === "number") return Number.isInteger(x) ? String(x) : String(x);
  return String(x);
}
function inputTable(): string {
  const rows: string[] = [];
  for (const g of INPUT_GROUPS) {
    rows.push(`<tr class="grp"><td colspan="5">${esc(g.title)}</td></tr>`);
    for (const f of g.items)
      rows.push(
        `<tr><td class="dsym">${pretty(SYM[f.k as string] ?? String(f.k))}</td>` +
        `<td style="width:22px;color:var(--ink3)">:=</td>` +
        `<td class="dres" style="text-align:left">${esc(fmtVal(f.k))}</td>` +
        `<td class="dref">${esc(f.unit)}</td>` +
        `<td style="color:var(--ink2)">${esc(f.cmt)}</td></tr>`);
  }
  return `<table class="t"><thead><tr><th>Symbol</th><th></th><th>Verdi</th><th>Enhet</th>` +
    `<th>Kommentar</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
function docTable(groups: DocGroup[]): string {
  const rows: string[] = [];
  for (const g of groups) {
    rows.push(`<tr class="grp"><td colspan="5">${esc(g.title)}</td></tr>`);
    for (const r of g.rows) {
      if (r.kind === "calc")
        rows.push(
          `<tr><td class="dsym">${pretty(r.sym)}</td><td class="dfml">${esc(r.fml)}</td>` +
          `<td class="dsub">${esc(r.sub)}</td><td class="dres">${esc(r.res)}</td>` +
          `<td class="dref">${esc(r.ref)}</td></tr>`);
      else
        rows.push(
          `<tr><td class="dsym">${esc(r.sym)}</td><td class="dfml" colspan="2">${esc(r.expr)}</td>` +
          `<td class="dres"><span class="badge ${r.ok ? "ok" : "no"}">${r.ok ? "✓ OK" : "✕ IKKE OK"}</span></td>` +
          `<td class="dref">${esc(r.ref)}</td></tr>`);
    }
  }
  return `<table class="t"><thead><tr><th>Symbol</th><th>Formel</th><th>Innsatte verdier</th>` +
    `<th>Resultat</th><th>Referanse</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
function renderDoc() {
  const dato = new Date().toLocaleDateString("nb-NO", { year: "numeric", month: "long", day: "numeric" });
  $("#doc").innerHTML =
    `<h1>Beregningsrapport — innfesting stålsøyle i pilaster</h1>` +
    `<div class="docmeta"><span>NS-EN 1992-4 · NS-EN 1992-1-1 · NS-EN 1993-1-8</span>` +
    `<span>Dato: ${esc(dato)}</span>` +
    `<span>Samlet status: <b class="${R.allOk ? "ok" : "bad"}">${R.allOk ? "OK" : "IKKE OK"}</b></span></div>` +
    `<div class="docactions"><button class="pbtn primary" id="btnPrint">Skriv ut / lagre som PDF</button></div>` +
    `<h2>Geometri</h2><div class="figs">` +
    `<div class="fig">${drawPlan(v, R, mech)}</div><div class="fig">${drawSection(v, R, mech)}</div></div>` +
    `<h2>Forutsetninger og inndata</h2>${inputTable()}` +
    `<h2>Beregning — formel, innsatte verdier, referanse</h2>${docTable(buildReport(v, R))}` +
    `<h2>Grunnlag</h2>${ASSUMPTIONS_HTML}`;
  ($("#btnPrint") as HTMLButtonElement).onclick = () => window.print();
}

/* ---------------- faner ---------------- */
function setTab(t: typeof tab) {
  tab = t;
  document.querySelectorAll("#tabbar button").forEach((b) =>
    b.setAttribute("aria-selected", String((b as HTMLElement).dataset.tab === t)));
  for (const [id, key] of [["#view3d", "3d"], ["#view2d", "2d"], ["#viewdoc", "doc"]] as const)
    $(id).classList.toggle("on", key === t);
  renderActive();
  if (t === "3d") viewer.resize();
}
document.querySelectorAll("#tabbar button").forEach((b) =>
  b.addEventListener("click", () => setTab((b as HTMLElement).dataset.tab as typeof tab)));

/** Tegner kun den synlige fanen — inputendringer treffer alle tre uten a koste unodig. */
function renderActive() {
  if (tab === "2d") render2d();
  if (tab === "doc") renderDoc();
}

function refresh() {
  R = compute(v);
  els = buildModel(v, R);
  viewer.setModel(els, (m) => shown.has(m));
  renderResults();
  renderActive();
}

/* ---------------- eksport ---------------- */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const setStatus = (s: string) => ($("#status").textContent = s);

($("#btnIfc") as HTMLButtonElement).onclick = async () => {
  setStatus("bygger IFC…");
  try {
    const blob = await exportIFC(buildModel(v, R), R, v);
    download(blob, "pilaster.ifc"); setStatus(`IFC eksportert (${(blob.size / 1024).toFixed(0)} kB)`);
  } catch (e: any) { setStatus("IFC-feil: " + e.message); console.error(e); }
};
($("#btnGlb") as HTMLButtonElement).onclick = async () => {
  setStatus("bygger GLB…");
  const blob = await viewer.exportGLB(); download(blob, "pilaster.glb"); setStatus("GLB eksportert");
};
($("#btnFit") as HTMLButtonElement).onclick = () => viewer.fitView();

// utskrift skal alltid vise en oppdatert rapport, ogsa fra 3D-/2D-fanen
addEventListener("beforeprint", renderDoc);

renderInputs(); renderToggles(); renderMechbar(); refresh(); viewer.fitView(); setStatus("klar");
(window as any).__pilaster = { v, compute, buildModel };
