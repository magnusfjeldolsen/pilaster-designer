# pilaster-3d

Interaktiv 3D-visning og **IFC-eksport** av innfesting av stålsøyle i pilaster
(bøyler, oppstikkende jern, gjengestag/ankerplate, evt. skjærnokk) — koblet til
kapasitetsberegning etter **NS-EN 1992-4 / NS-EN 1992-1-1**.

Formål: lage et lettvekts *konseptmodell* som kan sendes til stålleverandør
(IFC) før detaljmodellering i Revit.

## Teknologi

| Lag | Bibliotek |
|-----|-----------|
| Rendering | [three.js](https://threejs.org) (WebGL) |
| Geometri | egne parametriske primitiver (boks-ekstrudering + swept-disk) — **ingen CAD-kjerne nødvendig** |
| IFC lese/skrive | [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (ThatOpen, WASM, MIT) |
| Beregning | egen TS-modul (`src/calc.ts`) |
| Build | Vite + TypeScript |

Betong → `IfcExtrudedAreaSolid` (IfcColumn/IfcWall/IfcFooting), plater/bolter →
`IfcPlate`/`IfcMechanicalFastener`, armering → `IfcReinforcingBar` med
`IfcSweptDiskSolid`. Modellen er IFC4 (Reference View), med et egenskapssett
`Pset_PilasterKonsept_EC2` som bærer laster, utnyttelser og dimensjonerende
bøyleavstand/omfaring.

## Kom i gang

```bash
npm install
npm run dev        # utviklingsserver (http://localhost:5173)
npm run build      # produksjonsbygg til dist/
npm run preview    # server dist/ lokalt
```

`public/web-ifc.wasm` serveres fra site-rot og lastes i single-thread-modus
(ingen COOP/COEP-krav). Ved oppgradering av web-ifc: kopier ny
`node_modules/web-ifc/web-ifc.wasm` til `public/`.

## Bruk

Juster input i venstre panel (geometri, bolter, armering, skjærnokk, laster).
3D-visningen og resultatene oppdateres live. Knapper:

- **Eksporter IFC** → `pilaster.ifc` (IFC4, åpnes i Solibri, BIMcollab, Revit, Tekla, IfcOpenShell …)
- **Eksporter GLB** → `pilaster.glb` (rask visuell deling, three.js/Blender/nettviser)
- **Sentrer** → tilpass kamera

Avkryssingsboksene øverst til høyre skrur lag av/på (betong, bøyler, oppstikk, plater, stag, nokk).

## Arkitektur (én geometrikilde)

```
calc.ts    Inputs -> Results   (ren beregning, NS-EN 1992-4)
model.ts   (Inputs,Results) -> ElementSpec[]   (felles geometri)
   |__ viewer.ts  ElementSpec -> three.js-mesh (+ GLB)
   |__ ifc.ts     ElementSpec -> IFC4 (web-ifc) -> .ifc
main.ts    UI: input, resultater, eksport
```

Samme `ElementSpec[]` mater både 3D-visningen og IFC-en, så det du ser er det
leverandøren får.

## Publisere til GitHub

```bash
git init && git add -A && git commit -m "pilaster-3d: 3D + IFC-eksport"
git branch -M main
git remote add origin https://github.com/<bruker>/pilaster-3d.git
git push -u origin main
```

For statisk hosting (GitHub Pages/Netlify): `npm run build` og publiser `dist/`.

## Forbehold

Konsept-/beregningshjelp. Geometri og kapasiteter skal kontrolleres av
ansvarlig prosjekterende (RIB). Swept-disk-armering bruker åpne bøyler med
avrundede hjørner slik at alle IFC-geometrikjerner (inkl. OpenCASCADE/IfcOpenShell)
klarer å bygge soliden.
