import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../sunset-weather/index.html", import.meta.url), "utf8");
const source = html.split("/* ATMOSPHERE_MODEL_START */")[1].split("/* ATMOSPHERE_MODEL_END */")[0];
const model = { D2R: Math.PI / 180, R2D: 180 / Math.PI };
vm.createContext(model); vm.runInContext(source, model);
let checks = 0;
function near(a, b, tolerance, name) { assert.ok(Math.abs(a - b) <= tolerance, `${name}: ${a} vs ${b}`); checks++; }

near(model.traceRay(() => ({ n: 1, dh: 0, dd: 0 })).refraction, 0, 1e-10, "a vacuum never bends the ray");
near(model.traceRay(() => ({ n: 1.000277, dh: 0, dd: 0 })).refraction, 0, 1e-10, "a uniform refractive index never bends the ray");
const R = model.EARTH_RADIUS, nu = .000277, H = 8000;
const field = (d, h) => ({ n: 1 + nu * Math.exp(-h / H), dh: -nu / H * Math.exp(-h / H), dd: 0 });
const result = model.traceRay(field), fine = model.traceRay(field, .5);
// Independent spherical Snell invariant, b = n(0)R. Integrate
// -(n'/n)b/sqrt((nr)^2-b^2) dh with h=u^2 to remove the tangent singularity.
const invariant = (1 + nu) * R;
function integral(u) {
  if (u === 0) return nu / H / (1 + nu) * invariant * 2 / Math.sqrt(2 * invariant * (1 + nu - R * nu / H));
  const h = u * u, n = 1 + nu * Math.exp(-h / H);
  return nu / H * Math.exp(-h / H) / n * invariant / Math.sqrt((n * (R + h)) ** 2 - invariant ** 2) * 2 * u;
}
const N = 20000, du = Math.sqrt(80000) / N;
let expected = integral(0) + integral(Math.sqrt(80000));
for (let i = 1; i < N; i++) expected += (i % 2 ? 4 : 2) * integral(i * du);
expected *= du / 3 * 180 / Math.PI * 60;
near(result.refraction, expected, .002, "ray tracing matches the independent spherical integral in arcminutes");
near(result.refraction, fine.refraction, .002, "halving the integration step converges");
assert.ok(result.height >= 80000 && result.distance > 1000000); checks++;
assert.throws(() => model.traceRay(() => ({ n: 1.0003, dh: -3e-7, dd: 0 })), /surface/); checks++;

const nodes = Array.from({ length: 81 }, (_, i) => ({ h: i * 1000, p: 1013.25 * Math.exp(-i / 8), t: 288.15 }));
const columns = model.PROFILE_DISTANCES.map(km => ({ distance: km * 1000, nodes: nodes.map(n => ({ ...n })) }));
const uniform = model.atmosphericRay(columns).refraction;
const varied = structuredClone(columns);
for (let i = 2; i < varied.length; i++) for (const n of varied[i].nodes) n.t += 15;
const remoteChange = model.atmosphericRay(varied).refraction;
assert.ok(Math.abs(uniform - remoteChange) > .01, "remote temperature changes affect refraction while local temperature/pressure remain identical"); checks++;
near(columns[0].nodes[0].t, varied[0].nodes[0].t, 0, "local temperature did not change");
near(columns[0].nodes[0].p, varied[0].nodes[0].p, 0, "local pressure did not change");
const horizontal = model.refractiveField(varied, 50000, 500);
assert.notEqual(horizontal.dd, 0, "horizontal gradients enter the ray equation"); checks++;
const below = model.columnIndex(columns[0], 79999), above = model.columnIndex(columns[0], 80000);
near(below.n, above.n, 1e-9, "the extrapolated upper atmosphere is continuous");
assert.ok(model.columnIndex(columns[0], 90000).n < above.n); checks++;
console.log(`${checks} atmospheric physics checks passed. Independent integral error: ${(60 * (result.refraction - expected)).toFixed(6)} arcseconds.`);
