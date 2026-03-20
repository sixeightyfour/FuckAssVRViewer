import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const URL = './assets/graph.json';

let SCALE = 0.003;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 10000);
camera.position.set(0, 1.7, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;

document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));

const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(4, 10, 6);
scene.add(dir);

scene.add(new THREE.GridHelper(20, 20, 0x444444, 0x222222));
scene.add(new THREE.AxesHelper(2));

const worldRoot = new THREE.Group();
scene.add(worldRoot);

const graphRoot = new THREE.Group();
worldRoot.add(graphRoot);

let data;

// -------------------------
// Desktop fly controls state
// -------------------------
const keys = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
  Space: false,
  ShiftLeft: false,
  ShiftRight: false,
};

let isMouseLooking = false;
let yaw = 0;
let pitch = 0;

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

const FLY_SPEED = 8.0;
const FAST_MULTIPLIER = 3.0;
const LOOK_SPEED = 0.0025;

// -------------------------
// XR controllers
// -------------------------
const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
scene.add(controller1);
scene.add(controller2);

let xrSession = null;
let xrInputSources = [];

// -------------------------
// Build graph
// -------------------------
async function load() {
  data = await (await fetch(URL)).json();
  build();
}

function disposeGroupChildren(group) {
  while (group.children.length) {
    const child = group.children.pop();

    if (child.geometry) child.geometry.dispose?.();

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose?.());
      } else {
        child.material.dispose?.();
      }
    }
  }
}

function build() {
  disposeGroupChildren(graphRoot);

  const nodes = data.nodes || [];
  const links = data.links || [];

  const idToIndex = new Map();
  nodes.forEach((n, i) => idToIndex.set(n.id, i));

  // Nodes
  const nodeGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0x66ccff });
  const nodeMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, nodes.length);

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    v.set(n.x * SCALE, n.y * SCALE, n.z * SCALE);
    m.setPosition(v);
    nodeMesh.setMatrixAt(i, m);
  }

  nodeMesh.instanceMatrix.needsUpdate = true;
  graphRoot.add(nodeMesh);

  // Edges
  const arr = new Float32Array(links.length * 6);
  let c = 0;

  for (const l of links) {
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;

    const a = nodes[idToIndex.get(sourceId)];
    const b = nodes[idToIndex.get(targetId)];
    if (!a || !b) continue;

    arr[c++] = a.x * SCALE;
    arr[c++] = a.y * SCALE;
    arr[c++] = a.z * SCALE;
    arr[c++] = b.x * SCALE;
    arr[c++] = b.y * SCALE;
    arr[c++] = b.z * SCALE;
  }

  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(arr.slice(0, c), 3));

  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.3,
  });

  const lines = new THREE.LineSegments(edgeGeo, edgeMat);
  graphRoot.add(lines);
}

// -------------------------
// Scale controls
// -------------------------
function clampScale(value) {
  return Math.max(0.0005, Math.min(0.02, value));
}

function setScale(nextScale) {
  SCALE = clampScale(nextScale);

  const slider = document.getElementById('scale');
  if (slider) slider.value = String(SCALE);

  build();
}

function adjustScale(delta) {
  setScale(SCALE + delta);
}

const scaleInput = document.getElementById('scale');
if (scaleInput) {
  scaleInput.value = String(SCALE);
  scaleInput.addEventListener('input', (e) => {
    setScale(Number(e.target.value));
  });
}

// -------------------------
// Desktop controls
// -------------------------
function updateCameraRotation() {
  euler.set(pitch, yaw, 0);
  camera.quaternion.setFromEuler(euler);
}

renderer.domElement.addEventListener('mousedown', (e) => {
  if (renderer.xr.isPresenting) return;

  if (e.button === 0) {
    isMouseLooking = true;
  }
});

window.addEventListener('mouseup', () => {
  isMouseLooking = false;
});

window.addEventListener('mousemove', (e) => {
  if (renderer.xr.isPresenting) return;
  if (!isMouseLooking) return;

  yaw -= e.movementX * LOOK_SPEED;
  pitch -= e.movementY * LOOK_SPEED;

  const limit = Math.PI / 2 - 0.01;
  pitch = Math.max(-limit, Math.min(limit, pitch));

  updateCameraRotation();
});

window.addEventListener('keydown', (e) => {
  if (e.code in keys) keys[e.code] = true;

  if (e.key === '=' || e.key === '+') adjustScale(0.0005);
  if (e.key === '-' || e.key === '_') adjustScale(-0.0005);
});

window.addEventListener('keyup', (e) => {
  if (e.code in keys) keys[e.code] = false;
});

function updateDesktopFly(delta) {
  if (renderer.xr.isPresenting) return;

  forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);

  // Keep movement mostly in the horizontal plane for W/A/S/D
  forward.y = 0;
  right.y = 0;
  forward.normalize();
  right.normalize();

  const move = new THREE.Vector3();

  if (keys.KeyW) move.add(forward);
  if (keys.KeyS) move.sub(forward);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA) move.sub(right);
  if (keys.Space) move.y += 1;
  if (keys.ShiftLeft || keys.ShiftRight) move.y -= 1;

  if (move.lengthSq() > 0) {
    move.normalize();

    let speed = FLY_SPEED;
    if (keys.ShiftLeft && !keys.Space) speed *= FAST_MULTIPLIER;

    camera.position.addScaledVector(move, speed * delta);
  }
}

// -------------------------
// XR movement helpers
// -------------------------
renderer.xr.addEventListener('sessionstart', () => {
  xrSession = renderer.xr.getSession();
  xrInputSources = xrSession ? xrSession.inputSources : [];

  if (xrSession) {
    xrSession.addEventListener('inputsourceschange', () => {
      xrInputSources = xrSession.inputSources;
    });
  }
});

renderer.xr.addEventListener('sessionend', () => {
  xrSession = null;
  xrInputSources = [];
});

function getXRGamepads() {
  return xrInputSources
    .map((src) => src.gamepad)
    .filter(Boolean);
}

function updateXRFly(delta) {
  if (!renderer.xr.isPresenting) return;

  const xrCamera = renderer.xr.getCamera(camera);

  // Use headset forward/right projected onto horizontal plane
  const headsetQuaternion = xrCamera.quaternion;

  const flatForward = new THREE.Vector3(0, 0, -1).applyQuaternion(headsetQuaternion);
  const flatRight = new THREE.Vector3(1, 0, 0).applyQuaternion(headsetQuaternion);

  flatForward.y = 0;
  flatRight.y = 0;

  if (flatForward.lengthSq() === 0 || flatRight.lengthSq() === 0) return;

  flatForward.normalize();
  flatRight.normalize();

  const pads = getXRGamepads();

  let moveX = 0;
  let moveY = 0;
  let vertical = 0;
  let scaleDelta = 0;

  for (const gp of pads) {
    if (!gp.axes) continue;

    // Common XR thumbstick layout:
    // axes[2], axes[3] often right stick or primary stick
    // axes[0], axes[1] often left stick
    const ax0 = gp.axes[0] ?? 0;
    const ax1 = gp.axes[1] ?? 0;
    const ax2 = gp.axes[2] ?? 0;
    const ax3 = gp.axes[3] ?? 0;

    // Prefer left stick if present, otherwise fall back
    moveX += Math.abs(ax0) > 0.08 ? ax0 : 0;
    moveY += Math.abs(ax1) > 0.08 ? ax1 : 0;

    // Secondary stick vertical controls up/down when available
    vertical += Math.abs(ax3) > 0.15 ? -ax3 : 0;

    if (gp.buttons?.[4]?.pressed) scaleDelta += 0.0005;
    if (gp.buttons?.[5]?.pressed) scaleDelta -= 0.0005;

    // Fallback: use A/B or X/Y style buttons for scale if those exist
    if (gp.buttons?.[0]?.pressed && gp.buttons?.[1]?.pressed) {
      scaleDelta += 0.0005;
    }
    if (gp.buttons?.[2]?.pressed && gp.buttons?.[3]?.pressed) {
      scaleDelta -= 0.0005;
    }
  }

  if (scaleDelta !== 0) {
    adjustScale(scaleDelta);
  }

  const move = new THREE.Vector3();

  // In thumbstick convention, pushing forward usually gives negative Y
  move.addScaledVector(flatRight, moveX);
  move.addScaledVector(flatForward, -moveY);
  move.y += vertical;

  if (move.lengthSq() > 0) {
    move.normalize();
    worldRoot.position.addScaledVector(move, -6.0 * delta);
  }
}

// -------------------------
// Resize
// -------------------------
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// -------------------------
// Animate
// -------------------------
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);

  updateDesktopFly(delta);
  updateXRFly(delta);

  renderer.render(scene, camera);
});

load();