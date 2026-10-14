// millionaire.js — Roblox-style blocky millionaire with rounded edges
// Fully self-contained module. Mounts into #millionaire-container.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ===================================================================
   STYLES (injected once)
   =================================================================== */
const STYLE_ID = 'millionaire-rig-styles';

const CSS = `
.millionaire-rig-root {
  position: relative; width: 100%; height: 100%;
  overflow: hidden; background: #0f1116;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.millionaire-canvas { display: block; width: 100%; height: 100%; }

.millionaire-hud {
  position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  justify-content: center; padding: 10px 14px; border-radius: 16px;
  background: rgba(20, 23, 31, .74);
  border: 1px solid rgba(255,255,255,.08);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 16px 48px rgba(0,0,0,.55);
  z-index: 10; max-width: calc(100% - 28px);
}
.millionaire-btn {
  appearance: none; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.05); color: #dfe6f0;
  padding: 8px 15px; border-radius: 10px; font-size: 12.5px;
  font-weight: 700; cursor: pointer; letter-spacing: .04em;
  transition: .18s ease; font-family: inherit;
}
.millionaire-btn:hover { background: rgba(255,255,255,.13); transform: translateY(-1px); }
.millionaire-btn.active {
  background: #FFD700; color: #0f1116; border-color: transparent;
  box-shadow: 0 0 20px -4px #FFD700;
}
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
export function initMillionaire(containerId = 'millionaire-container') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`[millionaire.js] Container #${containerId} not found.`);
    return null;
  }
  if (container.dataset.millionaireMounted === 'true') return null;
  container.dataset.millionaireMounted = 'true';

  injectStyles();
  container.classList.add('millionaire-rig-root');

  /* ---------------------------------------------------------------
     HUD overlay
     --------------------------------------------------------------- */
  const hud = document.createElement('div');
  hud.className = 'millionaire-hud';
  container.appendChild(hud);

  const btnIdle = document.createElement('button');
  btnIdle.className = 'millionaire-btn active';
  btnIdle.textContent = 'Idle';

  const btnWalk = document.createElement('button');
  btnWalk.className = 'millionaire-btn';
  btnWalk.textContent = 'Walk';

  const btnRotate = document.createElement('button');
  btnRotate.className = 'millionaire-btn';
  btnRotate.textContent = 'Auto-Rotate';

  hud.append(btnIdle, btnWalk, btnRotate);

  /* ---------------------------------------------------------------
     Renderer
     --------------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.classList.add('millionaire-canvas');
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
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1.2));

  const keyLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
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

  const rimLight = new THREE.DirectionalLight(0xffaa00, 1.5);
  rimLight.position.set(-9, 5, -8);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x88bbff, 1.0);
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
    suit:     new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.75, metalness: 0.15 }),
    suitDark: new THREE.MeshStandardMaterial({ color: 0xE6C200, roughness: 0.75, metalness: 0.15 }),
    trim:     new THREE.MeshStandardMaterial({ color: 0x2ECC71, roughness: 0.70, metalness: 0.05 }),
    shirt:    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.90, metalness: 0.00 }),
    skin:     new THREE.MeshStandardMaterial({ color: 0xE8B990, roughness: 0.85 }),
    hair:     new THREE.MeshStandardMaterial({ color: 0x2C1E14, roughness: 0.92 }),
    eye:      new THREE.MeshStandardMaterial({ color: 0x0A0A0F, roughness: 0.30 }),
    hat:      new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.60, metalness: 0.20 }),
    hatBand:  new THREE.MeshStandardMaterial({ color: 0x2ECC71, roughness: 0.70, metalness: 0.05 }),
    shoe:     new THREE.MeshStandardMaterial({ color: 0x2ECC71, roughness: 0.70, metalness: 0.05 })
  };

  /* Rounded box helper */
  function rbox(w, h, d, mat, radius = 0.1, segments = 4) {
    const r = Math.min(radius, Math.min(w, h, d) * 0.49);
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, segments, r), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /* ---------------------------------------------------------------
     Hat Texture (Dollar sign decal)
     --------------------------------------------------------------- */
  function createHatTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#FFE066');
    grad.addColorStop(1, '#D4AF37');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#1A7A3A';
    ctx.font = 'bold 160px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 128, 128);

    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillStyle = '#2ECC71';
    ctx.fillText('$', 40, 50);
    ctx.fillText('$', 216, 50);
    ctx.fillText('$', 40, 206);
    ctx.fillText('$', 216, 206);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const hatTex = createHatTexture();
  const MAT_HAT_FRONT = new THREE.MeshStandardMaterial({ map: hatTex, roughness: 0.60, metalness: 0.20 });

  /* ---------------------------------------------------------------
     MILLIONAIRE RIG
     --------------------------------------------------------------- */
  const rich = new THREE.Group();
  scene.add(rich);

  /* --- TORSO --- */
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 3, 0);
  rich.add(torsoPivot);

  const torso = rbox(2, 2, 1, MAT.suit, 0.14);
  torsoPivot.add(torso);

  const lapelL = rbox(0.7, 1.2, 0.08, MAT.suitDark, 0.04);
  lapelL.position.set(-0.55, 0.3, 0.53);
  lapelL.rotation.z = 0.35;
  torsoPivot.add(lapelL);

  const lapelR = rbox(0.7, 1.2, 0.08, MAT.suitDark, 0.04);
  lapelR.position.set(0.55, 0.3, 0.53);
  lapelR.rotation.z = -0.35;
  torsoPivot.add(lapelR);

  const shirtPanel = rbox(0.8, 1.0, 0.1, MAT.shirt, 0.04);
  shirtPanel.position.set(0, 0.3, 0.55);
  torsoPivot.add(shirtPanel);

  const tieKnot = rbox(0.22, 0.18, 0.12, MAT.trim, 0.04);
  tieKnot.position.set(0, 0.75, 0.60);
  torsoPivot.add(tieKnot);

  const tieBody = rbox(0.20, 0.9, 0.10, MAT.trim, 0.03);
  tieBody.position.set(0, 0.25, 0.60);
  torsoPivot.add(tieBody);

  const belt = rbox(2.05, 0.3, 1.05, MAT.suitDark, 0.08);
  belt.position.set(0, -0.72, 0);
  torsoPivot.add(belt);

  const buckle = rbox(0.3, 0.24, 0.12, MAT.trim, 0.04);
  buckle.position.set(0, -0.72, 0.56);
  torsoPivot.add(buckle);

  /* --- HEAD --- */
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.15, 0);
  torsoPivot.add(headGroup);

  const head = rbox(1.6, 1.6, 1.6, MAT.skin, 0.16);
  head.position.y = 0.8;
  headGroup.add(head);

  const hairTop = rbox(1.64, 0.35, 1.64, MAT.hair, 0.10);
  hairTop.position.set(0, 1.48, 0);
  headGroup.add(hairTop);

  const hairBack = rbox(1.64, 0.8, 0.15, MAT.hair, 0.08);
  hairBack.position.set(0, 1.05, -0.80);
  headGroup.add(hairBack);

  const hairSideL = rbox(0.15, 0.8, 1.64, MAT.hair, 0.08);
  hairSideL.position.set(-0.80, 1.05, 0);
  headGroup.add(hairSideL);

  const hairSideR = rbox(0.15, 0.8, 1.64, MAT.hair, 0.08);
  hairSideR.position.set(0.80, 1.05, 0);
  headGroup.add(hairSideR);

  const eyeL = rbox(0.22, 0.22, 0.10, MAT.eye, 0.03);
  eyeL.position.set(-0.30, 0.90, 0.81);
  headGroup.add(eyeL);

  const eyeR = rbox(0.22, 0.22, 0.10, MAT.eye, 0.03);
  eyeR.position.set(0.30, 0.90, 0.81);
  headGroup.add(eyeR);

  // Smile base (dark mouth)
  const smileBase = rbox(0.55, 0.14, 0.08, MAT.eye, 0.02);
  smileBase.position.set(0, 0.38, 0.81);
  headGroup.add(smileBase);

  // Golden Teeth
  const tooth1 = rbox(0.12, 0.08, 0.10, MAT.suit, 0.02);
  tooth1.position.set(-0.18, 0.38, 0.82);
  headGroup.add(tooth1);

  const tooth2 = rbox(0.12, 0.08, 0.10, MAT.suit, 0.02);
  tooth2.position.set(0, 0.38, 0.82);
  headGroup.add(tooth2);

  const tooth3 = rbox(0.12, 0.08, 0.10, MAT.suit, 0.02);
  tooth3.position.set(0.18, 0.38, 0.82);
  headGroup.add(tooth3);

  /* --- TOP HAT --- */
  const hatGroup = new THREE.Group();
  hatGroup.position.set(0, 1.55, 0);
  headGroup.add(hatGroup);

  const hatBrim = rbox(2.0, 0.12, 2.0, MAT.hat, 0.05);
  hatBrim.position.y = 0;
  hatGroup.add(hatBrim);

  const hatCrownGeo = new RoundedBoxGeometry(1.15, 1.5, 1.15, 4, 0.12);
  const hatCrownMats = [
    MAT_HAT_FRONT, MAT_HAT_FRONT,
    MAT.hat,       MAT.hat,
    MAT_HAT_FRONT, MAT_HAT_FRONT
  ];
  const hatCrown = new THREE.Mesh(hatCrownGeo, hatCrownMats);
  hatCrown.position.y = 0.81;
  hatCrown.castShadow = true;
  hatCrown.receiveShadow = true;
  hatGroup.add(hatCrown);

  const hatBand = rbox(1.2, 0.22, 1.2, MAT.hatBand, 0.05);
  hatBand.position.y = 0.15;
  hatGroup.add(hatBand);

  /* --- ARMS --- */
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 1.5, 0.9, 0);

    const sleeve = rbox(1, 1.8, 1, MAT.suit, 0.14);
    sleeve.position.y = -0.9;
    arm.add(sleeve);

    const cuff = rbox(1.05, 0.22, 1.05, MAT.trim, 0.06);
    cuff.position.y = -1.7;
    arm.add(cuff);

    const hand = rbox(0.96, 0.6, 0.96, MAT.skin, 0.15);
    hand.position.y = -2.0;
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

    const thigh = rbox(1, 2, 1, MAT.suit, 0.14);
    thigh.position.y = -1;
    leg.add(thigh);

    const stripe = rbox(1.05, 0.2, 1.05, MAT.trim, 0.05);
    stripe.position.y = -1.75;
    leg.add(stripe);

    const shoe = rbox(1.06, 0.42, 1.7, MAT.shoe, 0.14);
    shoe.position.set(0, -1.95, 0.30);
    leg.add(shoe);

    return leg;
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  rich.add(legL, legR);

  /* ---------------------------------------------------------------
     HUD Logic
     --------------------------------------------------------------- */
  let targetWalk = 0;

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

  /* ---------------------------------------------------------------
     Animation loop
     --------------------------------------------------------------- */
  const clock = new THREE.Clock();
  let elapsed = 0;
  let walkMix = 0;
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
    legL.rotation.x =  Math.sin(walkT) * legAmp;
    legR.rotation.x = -Math.sin(walkT) * legAmp;

    // Arms
    const armAmp = 0.55 * w;
    armL.rotation.x = -Math.sin(walkT) * armAmp;
    armR.rotation.x =  Math.sin(walkT) * armAmp;

    const sway = Math.sin(idleT) * 0.05 * (1 - w);
    armL.rotation.z =  0.07 + sway;
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
    rich.position.y =
      Math.abs(Math.sin(walkT)) * 0.11 * w + Math.sin(idleT) * 0.025 * (1 - w);

    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  /* ---------------------------------------------------------------
     Resize (uses container size)
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

  return {
    scene, camera, renderer, controls, rich,
    dispose() {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      container.dataset.millionaireMounted = 'false';
    }
  };
}

/* ===================================================================
   AUTO-START — runs as soon as #millionaire-container exists in the DOM
   =================================================================== */
function autoStart() {
  if (document.getElementById('millionaire-container')) {
    initMillionaire('millionaire-container');
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoStart);
} else {
  autoStart();
}
