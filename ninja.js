// ninja.js — Roblox-style blocky ninja rig with rounded edges
// Fully self-contained module. Mounts into #ninja-container.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ===================================================================
   STYLES (injected once)
   =================================================================== */
const STYLE_ID = 'ninja-rig-styles';

const CSS = `
.ninja-rig-root {
  position: relative; width: 100%; height: 100%;
  overflow: hidden; background: #0f1116;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.ninja-canvas { display: block; width: 100%; height: 100%; }

.ninja-title {
  position: absolute; top: 22px; left: 26px; z-index: 10;
  color: #e8eef7; font-size: 13px; font-weight: 800;
  letter-spacing: .22em; text-transform: uppercase; opacity: .55;
  pointer-events: none;
}
.ninja-hint {
  position: absolute; top: 44px; left: 26px; z-index: 10;
  color: #7f8b9e; font-size: 11.5px; letter-spacing: .04em;
  pointer-events: none;
}
.ninja-hud {
  position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  justify-content: center; padding: 10px 14px; border-radius: 16px;
  background: rgba(20, 23, 31, .74);
  border: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 16px 48px rgba(0,0,0,.55);
  z-index: 10; max-width: calc(100% - 28px);
}
.ninja-btn {
  appearance: none; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.05); color: #dfe6f0;
  padding: 8px 15px; border-radius: 10px; font-size: 12.5px;
  font-weight: 700; cursor: pointer; letter-spacing: .04em;
  transition: .18s ease; font-family: inherit;
}
.ninja-btn:hover { background: rgba(255,255,255,.13); transform: translateY(-1px); }
.ninja-btn.active {
  background: var(--ninja-accent, #c0392b);
  border-color: transparent; color: #fff;
  box-shadow: 0 0 20px -4px var(--ninja-accent, #c0392b);
}
.ninja-swatches {
  display: flex; gap: 7px; margin-left: 6px; padding-left: 14px;
  border-left: 1px solid rgba(255,255,255,.1);
}
.ninja-sw {
  width: 22px; height: 22px; border-radius: 7px; cursor: pointer;
  border: 2px solid transparent; transition: .18s ease;
}
.ninja-sw:hover { transform: translateY(-2px) scale(1.06); }
.ninja-sw.active { border-color: #fff; box-shadow: 0 0 12px -2px currentColor; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ===================================================================
   MAIN
   =================================================================== */
export function initNinja(containerId = 'ninja-container') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[ninja.js] Container #${containerId} not found.`);
    return null;
  }
  if (container.dataset.ninjaMounted === 'true') return null;
  container.dataset.ninjaMounted = 'true';

  injectStyles();
  container.classList.add('ninja-rig-root');

  /* ---------------------------------------------------------------
     HUD overlay
     --------------------------------------------------------------- */
  const titleEl = document.createElement('div');
  titleEl.className = 'ninja-title';
  titleEl.textContent = 'Ninja Rig';
  container.appendChild(titleEl);

  const hintEl = document.createElement('div');
  hintEl.className = 'ninja-hint';
  hintEl.textContent = 'Drag to orbit · Scroll to zoom';
  container.appendChild(hintEl);

  const hud = document.createElement('div');
  hud.className = 'ninja-hud';
  container.appendChild(hud);

  const btnIdle = document.createElement('button');
  btnIdle.className = 'ninja-btn';
  btnIdle.textContent = 'Idle';

  const btnWalk = document.createElement('button');
  btnWalk.className = 'ninja-btn active';
  btnWalk.textContent = 'Walk';

  const btnRotate = document.createElement('button');
  btnRotate.className = 'ninja-btn';
  btnRotate.textContent = 'Auto-Rotate';

  const swatchWrap = document.createElement('div');
  swatchWrap.className = 'ninja-swatches';

  hud.append(btnIdle, btnWalk, btnRotate, swatchWrap);

  /* ---------------------------------------------------------------
     Renderer
     --------------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.classList.add('ninja-canvas');
  container.appendChild(renderer.domElement);

  /* ---------------------------------------------------------------
     Scene + Camera
     --------------------------------------------------------------- */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1116);
  scene.fog = new THREE.Fog(0x0f1116, 20, 48);

  const camera = new THREE.PerspectiveCamera(
    38, container.clientWidth / container.clientHeight, 0.1, 200
  );
  camera.position.set(6.2, 5.2, 9.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.9, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 4;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 1.3;
  controls.update();

  /* ---------------------------------------------------------------
     Lights
     --------------------------------------------------------------- */
  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x1a1a22, 1.05));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
  keyLight.position.set(7, 13, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 46;
  keyLight.shadow.camera.left = -9;
  keyLight.shadow.camera.right = 9;
  keyLight.shadow.camera.top = 12;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.bias = -0.0006;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xff4d4d, 1.7);
  rimLight.position.set(-9, 5, -8);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x5b8cff, 0.9);
  fillLight.position.set(-6, 3, 9);
  scene.add(fillLight);

  /* ---------------------------------------------------------------
     Ground
     --------------------------------------------------------------- */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(26, 72),
    new THREE.MeshStandardMaterial({ color: 0x191d26, roughness: 0.95, metalness: 0.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(52, 52, 0x33405a, 0x1e2430);
  grid.position.y = 0.003;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  /* ---------------------------------------------------------------
     Materials
     --------------------------------------------------------------- */
  const MAT = {
    cloth:     new THREE.MeshStandardMaterial({ color: 0x1b1e27, roughness: 0.88, metalness: 0.02 }),
    clothDeep: new THREE.MeshStandardMaterial({ color: 0x101219, roughness: 0.92, metalness: 0.02 }),
    accent:    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.60, metalness: 0.05 }),
    skin:      new THREE.MeshStandardMaterial({ color: 0xd8a97c, roughness: 0.85 }),
    eye:       new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 0.30 }),
    steel:     new THREE.MeshStandardMaterial({ color: 0xc7d0da, roughness: 0.18, metalness: 0.95 })
  };

  /* Rounded box helper — this is the Roblox-look vs Minecraft-look */
  function rbox(w, h, d, mat, radius = 0.1, segments = 4) {
    const r = Math.min(radius, Math.min(w, h, d) * 0.49);
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, r), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /* ---------------------------------------------------------------
     NINJA RIG
     --------------------------------------------------------------- */
  const ninja = new THREE.Group();
  scene.add(ninja);

  /* --- TORSO --- */
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 3, 0);
  ninja.add(torsoPivot);

  const torso = rbox(2, 2, 1, MAT.cloth, 0.14);
  torsoPivot.add(torso);

  const belt = rbox(2.08, 0.34, 1.08, MAT.accent, 0.09);
  belt.position.set(0, -0.72, 0);
  torsoPivot.add(belt);

  const knot = rbox(0.34, 0.34, 0.22, MAT.accent, 0.08);
  knot.position.set(0, -0.72, 0.55);
  torsoPivot.add(knot);

  const sash = rbox(2.5, 0.24, 0.1, MAT.accent, 0.05);
  sash.position.set(0, 0.05, 0.53);
  sash.rotation.z = -Math.PI / 4;
  torsoPivot.add(sash);

  /* --- HEAD --- */
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.15, 0);
  torsoPivot.add(headGroup);

  const head = rbox(1.6, 1.6, 1.6, MAT.cloth, 0.16);
  head.position.y = 0.8;
  headGroup.add(head);

  const visor = rbox(1.52, 0.44, 0.28, MAT.skin, 0.06);
  visor.position.set(0, 0.86, 0.70);
  headGroup.add(visor);

  const eyeL = rbox(0.26, 0.15, 0.12, MAT.eye, 0.04);
  eyeL.position.set(-0.30, 0.87, 0.80);
  headGroup.add(eyeL);

  const eyeR = eyeL.clone();
  eyeR.position.x = 0.30;
  headGroup.add(eyeR);

  const headband = rbox(1.68, 0.32, 1.68, MAT.accent, 0.10);
  headband.position.set(0, 1.34, 0);
  headGroup.add(headband);

  const tails = new THREE.Group();
  tails.position.set(0, 1.34, -0.82);
  headGroup.add(tails);

  const tail1 = rbox(0.22, 0.85, 0.09, MAT.accent, 0.04);
  tail1.position.set(-0.17, -0.35, -0.22);
  tail1.rotation.x = 0.45;
  tails.add(tail1);

  const tail2 = rbox(0.22, 0.98, 0.09, MAT.accent, 0.04);
  tail2.position.set(0.17, -0.40, -0.30);
  tail2.rotation.x = 0.62;
  tails.add(tail2);

  /* --- ARMS --- */
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 1.5, 0.9, 0);

    const sleeve = rbox(1, 2, 1, MAT.cloth, 0.14);
    sleeve.position.y = -1;
    arm.add(sleeve);

    const wrist = rbox(1.05, 0.22, 1.05, MAT.accent, 0.06);
    wrist.position.y = -1.58;
    arm.add(wrist);

    const hand = rbox(0.96, 0.62, 0.96, MAT.clothDeep, 0.16);
    hand.position.y = -1.85;
    arm.add(hand);

    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  torsoPivot.add(armL, armR);

  /* --- LEGS --- */
  function makeLeg(side) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.5, 2, 0);

    const thigh = rbox(1, 2, 1, MAT.cloth, 0.14);
    thigh.position.y = -1;
    leg.add(thigh);

    const ankle = rbox(1.05, 0.2, 1.05, MAT.clothDeep, 0.06);
    ankle.position.y = -1.62;
    leg.add(ankle);

    const foot = rbox(1.06, 0.44, 1.6, MAT.clothDeep, 0.14);
    foot.position.set(0, -1.78, 0.28);
    leg.add(foot);

    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  ninja.add(legL, legR);

  /* --- KATANA ON BACK --- */
  const sword = new THREE.Group();
  sword.position.set(0, 0.15, -0.75);
  sword.rotation.set(0.12, 0, -0.62);
  torsoPivot.add(sword);

  const scabbard = rbox(0.20, 2.2, 0.28, MAT.clothDeep, 0.06);
  scabbard.position.y = 1.0;
  sword.add(scabbard);

  const guard = rbox(0.42, 0.10, 0.42, MAT.steel, 0.03);
  guard.position.y = -0.14;
  sword.add(guard);

  const handle = rbox(0.18, 0.72, 0.18, MAT.accent, 0.06);
  handle.position.y = -0.55;
  sword.add(handle);

  /* ---------------------------------------------------------------
     HUD Logic
     --------------------------------------------------------------- */
  let targetWalk = 1;

  btnIdle.addEventListener('click', () => {
    btnIdle.classList.add('active');
    btnWalk.classList.remove('active');
    targetWalk = 0;
  });
  btnWalk.addEventListener('click', () => {
    btnWalk.classList.add('active');
    btnIdle.classList.remove('active');
    targetWalk = 1;
  });
  btnRotate.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    btnRotate.classList.toggle('active', controls.autoRotate);
  });

  const COLORS = ['#c0392b', '#2e86de', '#8e44ad', '#27ae60', '#e67e22', '#e8e8ea'];
  COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'ninja-sw' + (i === 0 ? ' active' : '');
    sw.style.background = c;
    sw.style.color = c;
    sw.addEventListener('click', () => {
      MAT.accent.color.set(c);
      container.style.setProperty('--ninja-accent', c);
      swatchWrap.querySelectorAll('.ninja-sw').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
    });
    swatchWrap.appendChild(sw);
  });
  // initialize the CSS accent on the container
  container.style.setProperty('--ninja-accent', COLORS[0]);

  /* ---------------------------------------------------------------
     Animation loop
     --------------------------------------------------------------- */
  const clock = new THREE.Clock();
  let elapsed = 0;
  let walkMix = 1;
  let rafId = 0;

  function tick() {
    rafId = requestAnimationFrame(tick);

    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    walkMix += (targetWalk - walkMix) * Math.min(1, dt * 5);
    const w = walkMix;

    const idleT = elapsed * 1.9;
    const walkT = elapsed * 8.0;

    // Legs
    const legAmp = 0.62 * w;
    legL.rotation.x = Math.sin(walkT) * legAmp;
    legR.rotation.x = -Math.sin(walkT) * legAmp;

    // Arms
    const armAmp = 0.55 * w;
    armL.rotation.x = -Math.sin(walkT) * armAmp;
    armR.rotation.x = Math.sin(walkT) * armAmp;

    const sway = Math.sin(idleT) * 0.05 * (1 - w);
    armL.rotation.z = 0.07 + sway;
    armR.rotation.z = -0.07 - sway;

    // Torso
    torsoPivot.rotation.y =
      Math.sin(idleT * 0.6) * 0.06 * (1 - w) + Math.sin(walkT) * 0.09 * w;
    torsoPivot.rotation.x = 0.05 * w;
    torsoPivot.rotation.z = Math.sin(walkT) * 0.03 * w;

    // Head
    headGroup.rotation.y = Math.sin(idleT * 0.45) * 0.16 * (1 - w);
    headGroup.rotation.x = -0.03 * w + Math.sin(idleT) * 0.02 * (1 - w);

    // Body bob
    ninja.position.y =
      Math.abs(Math.sin(walkT)) * 0.11 * w + Math.sin(idleT) * 0.025 * (1 - w);

    // Scarf flutter
    tails.rotation.x = 0.10 + Math.sin(elapsed * 3.2) * 0.14 + w * 0.30;
    tails.rotation.z = Math.sin(elapsed * 2.4) * 0.10;

    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  /* ---------------------------------------------------------------
     Resize (uses container size, not window)
     --------------------------------------------------------------- */
  const resizeObs = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
  });
  resizeObs.observe(container);

  /* ---------------------------------------------------------------
     Return API
     --------------------------------------------------------------- */
  return {
    scene, camera, renderer, controls, ninja,
    dispose() {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      container.dataset.ninjaMounted = 'false';
    }
  };
}

/* ===================================================================
   AUTO-START — runs as soon as #ninja-container exists in the DOM
   =================================================================== */
function autoStart() {
  if (document.getElementById('ninja-container')) {
    initNinja('ninja-container');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoStart);
} else {
  autoStart();
}
