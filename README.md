# pilaster-designer

Interactive **3D viewer + IFC export** for the anchorage of a steel column
base plate into a concrete **pilaster** — stirrups (ties), starter bars,
threaded rods / anchor plate, and an optional shear lug — coupled to a
capacity check to **NS-EN 1992-4 / NS-EN 1992-1-1**.

The goal is a lightweight *concept model* you can hand to a steel fabricator as
an open **IFC** file before detailing in Revit.

> Live app (GitHub Pages): **https://magnusfjeldolsen.github.io/pilaster-designer/**

## What it does

- Parametric inputs (geometry, bolts, reinforcement, shear lug, loads) with a
  live capacity check per NS-EN 1992-4 (bøyler as supplementary reinforcement,
  end-anchorage splitting, axial via starter bars, lap length & embedment).
- Real-time **three.js** 3D view of concrete, rebar, plates, rods and lug.
- One-click **IFC4** export (rebar as `IfcReinforcingBar` / `IfcSweptDiskSolid`,
  concrete as `IfcColumn`/`IfcWall`/`IfcFooting`, steel as `IfcPlate`/
  `IfcMechanicalFastener`), with a `Pset_PilasterKonsept_EC2` property set
  carrying loads, utilisations and the governing stirrup spacing / lap length.
- **GLB** export for quick visual sharing.

## Tech stack

| Layer | Library |
|-------|---------|
| Rendering | [three.js](https://threejs.org) (WebGL) |
| Geometry | parametric primitives (box extrusion + swept disk) — no CAD kernel required |
| IFC read/write | [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (ThatOpen, WASM, MIT) |
| Calculation | own TypeScript module (`src/calc.ts`) |
| Build / test | Vite + TypeScript + Vitest |

## Quick start

```bash
npm install
npm run dev        # dev server (http://localhost:5173)
```

Open the URL, adjust the inputs on the left, and use **Eksporter IFC** /
**Eksporter GLB** / **Sentrer**. Layer checkboxes (top-right) toggle
concrete / stirrups / starter bars / plates / rods / lug.

`public/web-ifc.wasm` is served from the site root and loaded in single-thread
mode (no COOP/COEP headers needed). After upgrading web-ifc, copy the new
`node_modules/web-ifc/web-ifc.wasm` into `public/`.

## Scripts

```bash
npm run dev         # start dev server
npm run typecheck   # tsc --noEmit
npm test            # run unit tests (Vitest)
npm run build       # typecheck + production build -> dist/
npm run preview     # serve the production build locally
```

## Tests

Unit tests cover the calculation module and the geometry model
(`src/*.test.ts`): material constants, bolt derivation (M-size → area, class →
f_ub/f_yb), lever arm `z`, effective-zone stirrup count, governing tie force,
shear-lug branch, and that the stirrup directrix is **open** (hook gap) so the
swept-disk solid builds in every IFC geometry kernel.

```bash
npm test
```

## Architecture (single geometry source)

```
calc.ts    Inputs -> Results            (pure calculation, NS-EN 1992-4)
model.ts   (Inputs,Results) -> ElementSpec[]   (shared geometry)
   |__ viewer.ts  ElementSpec -> three.js meshes (+ GLB)
   |__ ifc.ts     ElementSpec -> IFC4 (web-ifc) -> .ifc
main.ts    UI: inputs, results, export
```

The same `ElementSpec[]` feeds both the 3D view and the IFC, so what you see is
what the fabricator receives.

## CI / CD

- **`.github/workflows/ci.yml`** — on every push / PR to `main`: install,
  typecheck, unit tests, production build.
- **`.github/workflows/deploy.yml`** — on push to `main`: build and deploy
  `dist/` to **GitHub Pages** (GitHub Actions source).

To (re)enable Pages: repo **Settings → Pages → Build and deployment → Source:
GitHub Actions**. The Vite `base` is `./`, so the app works from the project
subpath.

## License

Proprietary / source-available — see [`LICENSE`](./LICENSE). Copyright ©
2026 Magnus Fjeld Olsen. Published for viewing only; internal company use is
permitted, all other use requires written permission.

## Disclaimer

Calculation and concept aid only. Geometry and capacities must be verified by
the responsible structural engineer (RIB) before use in design or fabrication.
