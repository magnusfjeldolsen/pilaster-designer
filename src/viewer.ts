// three.js-visning: bygger mesh fra ElementSpec (samme kilde som IFC).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { ElementSpec, Vec3 } from "./model";

export class Viewer {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private group = new THREE.Group();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0xf4f4f1);
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
    this.camera.position.set(1400, -1500, 900);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    // lys
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6b60, 1.05));
    const d = new THREE.DirectionalLight(0xffffff, 1.4);
    d.position.set(800, -1200, 1600); this.scene.add(d);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.5);
    d2.position.set(-1000, 900, 400); this.scene.add(d2);
    this.scene.add(this.group);
    const grid = new THREE.GridHelper(4000, 20, 0xbcbcb2, 0xe4e4dc);
    grid.rotation.x = Math.PI / 2; grid.position.z = -0.5; this.scene.add(grid);
    this.animate();
    addEventListener("resize", () => this.resize());
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || 800, h = c.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  setModel(els: ElementSpec[], filter: (m: string) => boolean = () => true) {
    this.group.clear();
    for (const e of els) {
      if (!filter(e.material)) continue;
      const mat = new THREE.MeshStandardMaterial({
        color: e.color, transparent: e.opacity < 1, opacity: e.opacity,
        metalness: e.material === "concrete" ? 0.0 : 0.35,
        roughness: e.material === "concrete" ? 0.95 : 0.5,
        side: e.opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
      });
      let geo: THREE.BufferGeometry;
      if (e.geom.kind === "box") {
        geo = new THREE.BoxGeometry(...e.geom.size);
        const [cx, cy, cz] = e.geom.center;
        geo.translate(cx, cy, cz);
      } else {
        const pts = e.geom.path.map((p: Vec3) => new THREE.Vector3(...p));
        const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.02);
        const seg = Math.max(16, pts.length * 8);
        geo = new THREE.TubeGeometry(curve, seg, e.geom.radius, 10, false);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = e.name; this.group.add(mesh);
    }
    this.resize();
  }

  fitView() {
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z);
    this.controls.target.copy(c);
    this.camera.position.set(c.x + r * 1.3, c.y - r * 1.5, c.z + r * 1.1);
    this.camera.near = r / 100; this.camera.far = r * 50;
    this.camera.updateProjectionMatrix();
  }

  async exportGLB(): Promise<Blob> {
    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(this.group, { binary: true });
    return new Blob([glb as ArrayBuffer], { type: "model/gltf-binary" });
  }
}
