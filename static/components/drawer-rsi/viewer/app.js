import * as THREE from "three";
import { OrbitControls } from "./OrbitControls.js";

const $ = (id) => document.getElementById(id);
const ui = { step: $("step"), trajectory: $("trajectory"), status: $("status"), stats: $("stats"), viewport: $("viewport"), loading: $("loading"), play: $("play"), time: $("time"), clock: $("clock"), speed: $("speed"), live: $("live"), dof: $("dof-table"), drawer: $("drawer-table") };
const colors = { left_hand: 0xd5793b, left_arm: 0x343383, target_handle: 0x3478b8, drawer: 0x8b93a3, table: 0xc9cdd5, obstacle: 0x9a6dac, right_robot: 0xb6bdc8, robot: 0xb6bdc8, environment: 0xd9dce3, other_handle: 0xa7aebb };
const query = new URLSearchParams(location.search);
if (query.get("embed") === "1") document.body.classList.add("embed");

let manifest, payload, rows = [], rowIndex = 0, scene, camera, renderer, controls, objects = [], playing = false, currentTime = 0, playAnchor = 0, timeAnchor = 0, view = query.get("view") || "overview";
const geometryCache = new Map();
const tmpPA = new THREE.Vector3(), tmpPB = new THREE.Vector3(), tmpQA = new THREE.Quaternion(), tmpQB = new THREE.Quaternion();

async function fetchGzipJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const bytes = await response.arrayBuffer();
  const view = new Uint8Array(bytes);
  const isGzip = view.length > 2 && view[0] === 0x1f && view[1] === 0x8b;
  if (!isGzip) return JSON.parse(new TextDecoder().decode(view));
  if (!("DecompressionStream" in window)) throw new Error("This browser does not support gzip streaming.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
function payloadUrl(row) { return new URL(`../${row.viewer_payload}`, location.href); }
function geometryUrl(value) { return new URL(`../${value}`, location.href); }
async function hydrateGeometry(value) {
  if (!geometryCache.has(value)) geometryCache.set(value, fetchGzipJson(geometryUrl(value)));
  const geometry = await geometryCache.get(value);
  payload.geoms = geometry.geoms;
  payload.meshes = geometry.meshes;
}
function geometryFor(g, p) {
  if (g.type === 7 && g.mesh_id >= 0) { const src = p.meshes[String(g.mesh_id)], geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(src.vertices.flat(), 3)); geo.setIndex(src.faces.flat()); geo.computeVertexNormals(); return geo; }
  if (g.type === 2) return new THREE.SphereGeometry(g.size[0], 18, 12);
  if (g.type === 3) { const geo = new THREE.CapsuleGeometry(g.size[0], 2 * g.size[1], 6, 12); geo.rotateX(Math.PI / 2); return geo; }
  if (g.type === 4) { const geo = new THREE.SphereGeometry(1, 18, 12); geo.scale(...g.size); return geo; }
  if (g.type === 5) { const geo = new THREE.CylinderGeometry(g.size[0], g.size[0], 2 * g.size[1], 16); geo.rotateX(Math.PI / 2); return geo; }
  return new THREE.BoxGeometry(2 * g.size[0], 2 * g.size[1], 2 * g.size[2]);
}
function initScene() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xf9fafc);
  camera = new THREE.PerspectiveCamera(42, 1, .01, 20); camera.up.set(0, 0, 1);
  renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; ui.viewport.prepend(renderer.domElement);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.screenSpacePanning = true; controls.minDistance = .1; controls.maxDistance = 4;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4c5260, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.7); key.position.set(-2, -3, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.1); fill.position.set(2, 1, 2); scene.add(fill);
  new ResizeObserver(resize).observe(ui.viewport); resize(); requestAnimationFrame(animate);
}
function resize() { const w = ui.viewport.clientWidth, h = ui.viewport.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
function rebuild() { for (const o of objects) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); } objects = payload.geoms.map((g) => { const material = new THREE.MeshStandardMaterial({ color: colors[g.category] ?? 0xc9cdd5, roughness: .72, metalness: .04, side: THREE.DoubleSide }); const o = new THREE.Mesh(geometryFor(g, payload), material); o.name = g.name; scene.add(o); return o; }); }
function upperIndex(frames, time) { let lo = 0, hi = frames.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (frames[mid].time <= time) lo = mid + 1; else hi = mid; } return Math.min(frames.length - 1, lo); }
const fmt = (v) => Number(v).toFixed(4);
function stateTable(target, names, qpos, qvel, ctrl) { const head = `<div class="state-row"><span>joint</span><span>qpos</span><span>qvel</span><span>ctrl</span></div>`; target.innerHTML = head + names.map((n, i) => `<div class="state-row"><span>${n}</span><span>${fmt(qpos[i])}</span><span>${fmt(qvel[i])}</span><span>${ctrl ? fmt(ctrl[i]) : "—"}</span></div>`).join(""); }
function update(time) {
  if (!payload) return; currentTime = Math.max(0, Math.min(payload.duration_s, time));
  const upper = upperIndex(payload.frames, currentTime), lower = Math.max(0, upper - 1), a = payload.frames[lower], b = payload.frames[upper], span = Math.max(.000001, b.time - a.time), alpha = upper === lower ? 0 : Math.max(0, Math.min(1, (currentTime - a.time) / span));
  for (let i = 0; i < objects.length; i += 1) { const ta = a.transforms[i], tb = b.transforms[i]; tmpPA.set(...ta.slice(0, 3)); tmpPB.set(...tb.slice(0, 3)); objects[i].position.lerpVectors(tmpPA, tmpPB, alpha); tmpQA.set(...ta.slice(3, 7)); tmpQB.set(...tb.slice(3, 7)); objects[i].quaternion.slerpQuaternions(tmpQA, tmpQB, alpha); }
  const f = alpha < .5 ? a : b; ui.time.value = currentTime; ui.clock.textContent = `${currentTime.toFixed(2)} / ${payload.duration_s.toFixed(2)} s`;
  ui.live.innerHTML = `<dt>Stage</dt><dd>${f.stage_id} · ${f.stage_name}</dd><dt>Handle force</dt><dd>${fmt(f.force_n)} N</dd><dt>Finger groups</dt><dd>${f.active_group_count}</dd><dt>Opposition angle</dt><dd>${fmt(f.local_circle_angle_deg)}°</dd><dt>Drawer qpos</dt><dd>${f.drawer_qpos.map(fmt).join(" / ")}</dd>`;
  stateTable(ui.dof, payload.state_joint_names, f.state_qpos, f.state_qvel, f.state_ctrl); stateTable(ui.drawer, payload.drawer_joint_names, f.drawer_qpos, f.drawer_qvel, null);
}
function setView(kind) { view = kind; if (!payload) return; const t = new THREE.Vector3(...payload.camera_target); controls.target.copy(t); if (kind === "closeup") camera.position.set(t.x - .34, t.y - .54, t.z + .18); else camera.position.set(t.x - .72, t.y - 1.36, t.z + .58); controls.update(); }
function stat(label, value, cls = "") { return `<div class="stat card"><span>${label}</span><strong class="${cls}">${value}</strong></div>`; }
async function loadRow(index) {
  if (index < 0) index = 0; rowIndex = index; playing = false; ui.play.textContent = "Play"; const row = rows[index]; ui.trajectory.value = row.case_id; ui.loading.hidden = false; ui.loading.textContent = "Loading 3D trajectory…"; ui.status.textContent = `step ${row.step.toLocaleString()} · ${row.instruction}`;
  payload = await fetchGzipJson(payloadUrl(row)); await hydrateGeometry(payload.geometry_payload); rebuild(); ui.time.max = payload.duration_s;
  const ev = manifest.evals.find((x) => x.step === row.step), report = ev?.report?.overall;
  ui.stats.innerHTML = stat("Eval result", report ? `${report.successes}/${report.total}` : "—") + stat("Instruction", row.instruction) + stat("Outcome", row.success ? "SUCCESS" : "FAIL", row.success ? "success" : "failure");
  setView(view); update(0); ui.loading.hidden = true; parent.postMessage({ type: "drawer-rsi-viewer-ready", caseId: row.case_id }, "*");
}
function populateStep(step, preferredCase) { rows = manifest.trajectories.filter((x) => x.step === step); ui.trajectory.innerHTML = rows.map((r, index) => `<option value="${r.case_id}">${r.instruction} · ${r.success ? "success" : "failure"} · example ${index + 1}</option>`).join(""); const index = preferredCase ? rows.findIndex((r) => r.case_id === preferredCase) : 0; loadRow(index).catch(showError); }
function showError(e) { ui.loading.hidden = false; ui.loading.textContent = "Unable to load this trajectory."; ui.status.textContent = ""; console.error(e); }
function animate(now) { if (playing && payload) { const next = timeAnchor + (now - playAnchor) / 1000 * Number(ui.speed.value); if (next >= payload.duration_s) { update(payload.duration_s); playing = false; ui.play.textContent = "Play"; } else update(next); } controls?.update(); renderer?.render(scene, camera); requestAnimationFrame(animate); }

ui.step.addEventListener("change", () => populateStep(Number(ui.step.value))); ui.trajectory.addEventListener("change", () => loadRow(rows.findIndex((r) => r.case_id === ui.trajectory.value)).catch(showError));
$("prev").addEventListener("click", () => loadRow((rowIndex + rows.length - 1) % rows.length).catch(showError)); $("next").addEventListener("click", () => loadRow((rowIndex + 1) % rows.length).catch(showError));
ui.play.addEventListener("click", () => { if (!playing && currentTime >= payload.duration_s - .001) update(0); playing = !playing; ui.play.textContent = playing ? "Pause" : "Play"; playAnchor = performance.now(); timeAnchor = currentTime; });
ui.time.addEventListener("input", () => { update(Number(ui.time.value)); playAnchor = performance.now(); timeAnchor = currentTime; }); $("overview").addEventListener("click", () => setView("overview")); $("closeup").addEventListener("click", () => setView("closeup"));

try {
  manifest = await fetch(new URL("../manifest.json?v=public-cleanup", location.href)).then((r) => { if (!r.ok) throw new Error(`${r.status} manifest.json`); return r.json(); });
  ui.step.innerHTML = manifest.steps.map((s) => `<option value="${s}">${s.toLocaleString()}</option>`).join(""); initScene();
  const caseId = query.get("case"), selected = caseId ? manifest.trajectories.find((r) => r.case_id === caseId) : null, step = selected?.step ?? (Number(query.get("step")) || manifest.steps[0]); ui.step.value = step; populateStep(step, caseId);
} catch (e) { showError(e); }
