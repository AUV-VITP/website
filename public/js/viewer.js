import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL_URL = "assets/isonavi-web.glb";
const HOME = new THREE.Vector3(2.15, 0.95, 2.45);

// Finish per CAD material. Base colours come from the GLB, which carries the
// colours defined in the CAD assembly.
const FINISH = {
  hull: { roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.8 },
  window: { roughness: 0.1, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 },
  accent: { roughness: 0.42, metalness: 0.15, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1 },
  dark: { roughness: 0.5, metalness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 1 },
  metal: { roughness: 0.28, metalness: 0.9, envMapIntensity: 1.2 },
  anode: { roughness: 0.4, metalness: 0.9, envMapIntensity: 1.1 },
  weight: { roughness: 0.45, metalness: 0.6, envMapIntensity: 1 },
};

function sonarRings(radius) {
  const rings = [];
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4db4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius * 0.985, radius, 128), mat);
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
    rings.push({ mesh, offset: i / 3 });
  }
  return { group, rings };
}

export async function initViewer(canvas, { onProgress, onReady, onError } = {}) {
  const stage = canvas.parentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (err) {
    onError?.(err);
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envMap = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose?.();
  pmrem.dispose();

  const scene = new THREE.Scene();
  scene.environment = envMap;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  camera.position.copy(HOME);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 6, 3);
  const rim = new THREE.DirectionalLight(0x58b4ff, 1.6);
  rim.position.set(-5, 2, -4);
  scene.add(key, rim);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.rotateSpeed = 0.8;
  controls.enablePan = false;
  controls.enableZoom = false; // enabled after the first click so page scroll is not hijacked
  controls.minDistance = 1.8;
  controls.maxDistance = 7;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 1.1;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  canvas.style.touchAction = "pan-y"; // vertical swipes still scroll the page on phones

  // Resume spinning a moment after the user lets go, no snapping
  let resumeTimer = 0;
  let spinWanted = controls.autoRotate;
  controls.addEventListener("start", () => {
    clearTimeout(resumeTimer);
    controls.autoRotate = false;
  });
  controls.addEventListener("end", () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => (controls.autoRotate = spinWanted), 2600);
  });

  canvas.addEventListener("pointerdown", () => (controls.enableZoom = true));
  canvas.addEventListener("pointerleave", () => (controls.enableZoom = false));
  canvas.addEventListener("dblclick", () => resetView());

  // Sonar rings on the "seabed" under the vehicle
  const floor = sonarRings(1.25);
  scene.add(floor.group);

  const groups = {}; // material name -> meshes
  let model = null;
  let home = { pos: HOME.clone(), target: new THREE.Vector3() };

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      model = gltf.scene;
      model.traverse((o) => {
        if (!o.isMesh) return;
        const old = o.material;
        const name = old.name || "metal";
        const mat = new THREE.MeshPhysicalMaterial({ color: old.color, ...(FINISH[name] || FINISH.metal) });
        mat.name = name;
        o.material = mat;
        (groups[name] ||= []).push(o);
      });

      const box = new THREE.Box3().setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      model.position.sub(c);
      scene.add(model);

      const fitted = new THREE.Box3().setFromObject(model);
      floor.group.position.y = fitted.min.y - 0.4;

      home = { pos: HOME.clone(), target: new THREE.Vector3(0, -0.05, 0) };
      controls.target.copy(home.target);
      camera.position.copy(home.pos);
      controls.update();
      onReady?.();
    },
    (e) => onProgress?.({ loaded: e.loaded, total: e.total || 0 }),
    (err) => onError?.(err)
  );

  function resize() {
    const w = Math.max(stage.clientWidth, 1);
    const h = Math.max(stage.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the 2 m hull inside the frame on tall (mobile) stages
    camera.fov = w / h < 1 ? 58 : 32;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  // Only render while on screen
  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) clock.getDelta();
  });
  io.observe(stage);

  const clock = new THREE.Clock();
  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    controls.update(dt);
    for (const r of floor.rings) {
      const p = (t / 6 + r.offset) % 1;
      r.mesh.scale.setScalar(0.25 + p * 1.9);
      r.mesh.material.opacity = (1 - p) * (1 - p) * 0.55 * Math.min(1, p * 8);
    }
    renderer.render(scene, camera);
  }
  tick();

  function resetView() {
    // Ease back to the home pose
    const from = { p: camera.position.clone(), t: controls.target.clone() };
    const start = performance.now();
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    (function step(now) {
      const k = Math.min((now - start) / 700, 1);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(from.p, home.pos, e);
      controls.target.lerpVectors(from.t, home.target, e);
      if (k < 1) requestAnimationFrame(step);
      else resumeTimer = setTimeout(() => (controls.autoRotate = spinWanted), 1500);
    })(start);
  }

  return {
    resetView,
    setAutoRotate(on) {
      spinWanted = on;
      controls.autoRotate = on;
    },
    setPartVisible(name, on) {
      for (const m of groups[name] || []) m.visible = on;
    },
    // Fade every other part while one chip is hovered
    focusPart(name) {
      for (const [n, list] of Object.entries(groups)) {
        for (const m of list) {
          const dim = name && n !== name;
          m.material.transparent = !!dim;
          m.material.opacity = dim ? 0.12 : 1;
          m.material.depthWrite = !dim;
          m.material.needsUpdate = true;
        }
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      envMap.dispose();
      renderer.dispose();
    },
  };
}
