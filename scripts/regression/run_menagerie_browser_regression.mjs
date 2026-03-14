#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";

const DEFAULT_REGRESSION_ROOT = path.resolve(".tmp/regression");
const DEFAULT_TRUTH_PATH = path.join(DEFAULT_REGRESSION_ROOT, "menagerie_truth.json");
const DEFAULT_OUTPUT_PATH = path.join(
  DEFAULT_REGRESSION_ROOT,
  "browser_regression_results.json",
);
const DEFAULT_SITE_URL = "http://127.0.0.1:4173";
const DEFAULT_SITE_TIMEOUT_MS = 120_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 120_000;
const DEFAULT_FLOAT_TOLERANCE = 1e-5;
const DEFAULT_START_COMMAND = (host, port) =>
  `npm run dev -- --host ${host} --port ${port}`;
const DEFAULT_EXECUTABLE_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

const HELP_TEXT = `Usage:
  node scripts/regression/run_menagerie_browser_regression.mjs [options]

Options:
  --site-url <url>            URDF Studio site URL. Default: ${DEFAULT_SITE_URL}
  --truth <path>              Truth manifest path. Default: ${DEFAULT_TRUTH_PATH}
  --output <path>             Result JSON path. Default: ${DEFAULT_OUTPUT_PATH}
  --regression-root <path>    Regression workspace root. Default: ${DEFAULT_REGRESSION_ROOT}
  --model-dir <name>          Restrict run to one model_dir. Repeatable.
  --site-timeout-ms <ms>      Site startup/connect timeout. Default: ${DEFAULT_SITE_TIMEOUT_MS}
  --timeout-ms <ms>           Browser/debug operation timeout. Default: ${DEFAULT_OPERATION_TIMEOUT_MS}
  --float-tol <number>        Numeric diff tolerance. Default: ${DEFAULT_FLOAT_TOLERANCE}
  --start-command <command>   Override auto-start command when site is offline.
  --no-start                  Fail instead of starting the site automatically.
  --chrome-path <path>        Browser executable path.
  --headed                    Launch headed browser instead of headless.
  --help                      Show this help.

Expected debug API on window.__URDF_STUDIO_DEBUG__:
  - An async load method matching one of:
      loadImportedXml, loadImportedXmlFile, loadXmlFile, loadXml, loadMjcfXml
  - An async snapshot method matching one of:
      captureRegressionSnapshot, captureSnapshot, getSnapshot, snapshot
  - Optional ping/health method:
      ping, healthCheck, healthcheck, ready
`;

function fail(message) {
  throw new Error(message);
}

function parseInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`Invalid value for ${flagName}: ${value}`);
  }
  return parsed;
}

function parseFloatValue(value, flagName) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`Invalid value for ${flagName}: ${value}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    siteUrl: DEFAULT_SITE_URL,
    truthPath: DEFAULT_TRUTH_PATH,
    outputPath: DEFAULT_OUTPUT_PATH,
    regressionRoot: DEFAULT_REGRESSION_ROOT,
    modelDirs: [],
    siteTimeoutMs: DEFAULT_SITE_TIMEOUT_MS,
    timeoutMs: DEFAULT_OPERATION_TIMEOUT_MS,
    floatTolerance: DEFAULT_FLOAT_TOLERANCE,
    noStart: false,
    startCommand: null,
    chromePath: null,
    headed: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    const nextValue = () => {
      const value = argv[index + 1];
      if (value == null) {
        fail(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--site-url":
        options.siteUrl = nextValue();
        break;
      case "--truth":
        options.truthPath = path.resolve(nextValue());
        break;
      case "--output":
        options.outputPath = path.resolve(nextValue());
        break;
      case "--regression-root":
        options.regressionRoot = path.resolve(nextValue());
        break;
      case "--model-dir":
        options.modelDirs.push(nextValue());
        break;
      case "--site-timeout-ms":
        options.siteTimeoutMs = parseInteger(nextValue(), "--site-timeout-ms");
        break;
      case "--timeout-ms":
        options.timeoutMs = parseInteger(nextValue(), "--timeout-ms");
        break;
      case "--float-tol":
        options.floatTolerance = parseFloatValue(nextValue(), "--float-tol");
        break;
      case "--start-command":
        options.startCommand = nextValue();
        break;
      case "--no-start":
        options.noStart = true;
        break;
      case "--chrome-path":
        options.chromePath = path.resolve(nextValue());
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--help":
      case "-h":
        console.log(HELP_TEXT);
        process.exit(0);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  options.siteUrl = new URL(options.siteUrl).toString();
  options.truthPath = path.resolve(options.truthPath);
  options.outputPath = path.resolve(options.outputPath);
  options.regressionRoot = path.resolve(options.regressionRoot);
  options.modelDirs = [...new Set(options.modelDirs)];
  return options;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function assertTruthManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    fail("Truth manifest must be a JSON object.");
  }
  if (!Array.isArray(manifest.entries)) {
    fail("Truth manifest must contain an entries array.");
  }
}

function groupTruthEntries(manifest, selectedModelDirs) {
  const selected = new Set(selectedModelDirs);
  const grouped = new Map();

  for (const entry of manifest.entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const modelDir = entry.model_dir;
    const xmlFile = entry.xml_file;
    if (typeof modelDir !== "string" || typeof xmlFile !== "string") {
      continue;
    }

    if (selected.size > 0 && !selected.has(modelDir)) {
      continue;
    }

    const bucket = grouped.get(modelDir) ?? [];
    bucket.push(entry);
    grouped.set(modelDir, bucket);
  }

  for (const entries of grouped.values()) {
    entries.sort((left, right) => String(left.xml_file).localeCompare(String(right.xml_file)));
  }

  return grouped;
}

async function listZipCandidates(rootDir) {
  const results = [];

  async function visit(currentPath) {
    const dirents = await fs.readdir(currentPath, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name === ".git" || dirent.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(currentPath, dirent.name);
      if (dirent.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (dirent.isFile() && dirent.name.toLowerCase().endsWith(".zip")) {
        results.push(fullPath);
      }
    }
  }

  try {
    await visit(rootDir);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return results.sort();
}

function getExplicitZipPaths(modelEntries, regressionRoot) {
  const explicitKeys = [
    "zip_path",
    "zipPath",
    "archive_path",
    "archivePath",
    "zip_file",
    "zipFile",
  ];
  const results = [];

  for (const entry of modelEntries) {
    for (const key of explicitKeys) {
      const candidate = entry?.[key];
      if (typeof candidate !== "string" || candidate.trim() === "") {
        continue;
      }

      if (path.isAbsolute(candidate)) {
        results.push(path.normalize(candidate));
      } else {
        results.push(path.resolve(regressionRoot, candidate));
      }
    }
  }

  return [...new Set(results)];
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function scoreZipCandidate(modelDir, candidatePath) {
  const normalizedModelDir = modelDir.toLowerCase();
  const basename = path.basename(candidatePath, ".zip").toLowerCase();
  const parentName = path.basename(path.dirname(candidatePath)).toLowerCase();
  const fullPath = candidatePath.toLowerCase();

  let score = 0;
  if (basename === normalizedModelDir) score += 100;
  if (parentName === normalizedModelDir) score += 80;
  if (basename.includes(normalizedModelDir)) score += 40;
  if (fullPath.includes(`/${normalizedModelDir}/`) || fullPath.includes(`\\${normalizedModelDir}\\`)) {
    score += 20;
  }
  if (fullPath.includes(normalizedModelDir)) score += 10;
  return score;
}

async function resolveZipPath(modelDir, modelEntries, regressionRoot, zipCandidates) {
  const explicitPaths = getExplicitZipPaths(modelEntries, regressionRoot);
  for (const candidate of explicitPaths) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  const preferredPaths = [
    path.join(regressionRoot, `${modelDir}.zip`),
    path.join(regressionRoot, "zips", `${modelDir}.zip`),
    path.join(regressionRoot, "packages", `${modelDir}.zip`),
    path.join(regressionRoot, modelDir, `${modelDir}.zip`),
    path.join(regressionRoot, modelDir, "archive.zip"),
    path.join(regressionRoot, modelDir, "model.zip"),
  ];

  for (const candidate of preferredPaths) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  const scored = zipCandidates
    .map((candidatePath) => ({
      candidatePath,
      score: scoreZipCandidate(modelDir, candidatePath),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.candidatePath.localeCompare(right.candidatePath));

  if (scored.length === 0) {
    fail(`Could not find a zip package for model_dir=${modelDir}`);
  }

  if (scored.length > 1 && scored[0].score === scored[1].score) {
    const ambiguous = scored.slice(0, 5).map((entry) => entry.candidatePath).join(", ");
    fail(
      `Multiple zip candidates matched model_dir=${modelDir} with the same score. ` +
        `Pass an explicit zip path in the truth manifest. Candidates: ${ambiguous}`,
    );
  }

  return scored[0].candidatePath;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function isSiteReachable(siteUrl, timeoutMs) {
  try {
    const response = await fetchWithTimeout(siteUrl, Math.min(timeoutMs, 10_000));
    return response.ok;
  } catch {
    return false;
  }
}

function createLogBuffer(limit = 200) {
  const lines = [];
  return {
    push(line) {
      if (typeof line !== "string" || line.length === 0) {
        return;
      }
      lines.push(line);
      if (lines.length > limit) {
        lines.splice(0, lines.length - limit);
      }
    },
    toString() {
      return lines.join("\n");
    },
  };
}

function spawnSiteProcess(command, cwd) {
  const logs = createLogBuffer();
  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BROWSER: "none",
    },
  });

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => logs.push(String(chunk).trimEnd()));
  child.stderr?.on("data", (chunk) => logs.push(String(chunk).trimEnd()));

  return {
    child,
    logs,
    async stop() {
      if (child.exitCode != null || child.signalCode != null) {
        return;
      }

      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        return;
      }

      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (child.exitCode != null || child.signalCode != null) {
          return;
        }
        await delay(100);
      }

      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // ignore
      }
    },
  };
}

async function ensureSite(siteUrl, options) {
  if (await isSiteReachable(siteUrl, options.siteTimeoutMs)) {
    return {
      startedByScript: false,
      siteUrl,
      stop: async () => {},
    };
  }

  if (options.noStart) {
    fail(`Site is not reachable at ${siteUrl} and --no-start was set.`);
  }

  const parsedUrl = new URL(siteUrl);
  const host = parsedUrl.hostname;
  const port = parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");
  const command = options.startCommand ?? DEFAULT_START_COMMAND(host, port);
  const siteProcess = spawnSiteProcess(command, process.cwd());
  const deadline = Date.now() + options.siteTimeoutMs;

  try {
    while (Date.now() < deadline) {
      if (await isSiteReachable(siteUrl, 5_000)) {
        return {
          startedByScript: true,
          siteUrl,
          stop: siteProcess.stop,
        };
      }

      if (siteProcess.child.exitCode != null) {
        fail(
          `Site start command exited early: ${command}\n` +
            `Last logs:\n${siteProcess.logs.toString() || "(no logs captured)"}`,
        );
      }

      await delay(500);
    }

    fail(
      `Timed out waiting for site ${siteUrl} after starting: ${command}\n` +
        `Last logs:\n${siteProcess.logs.toString() || "(no logs captured)"}`,
    );
  } catch (error) {
    await siteProcess.stop();
    throw error;
  }
}

async function resolveChromeExecutable(chromePath) {
  if (chromePath) {
    return chromePath;
  }

  for (const candidate of DEFAULT_EXECUTABLE_CANDIDATES) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function launchBrowser(options) {
  const executablePath = await resolveChromeExecutable(options.chromePath);
  const browser = await puppeteer.launch({
    headless: options.headed ? false : true,
    executablePath: executablePath ?? undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: {
      width: 1600,
      height: 1000,
      deviceScaleFactor: 1,
    },
  });

  return browser;
}

function ringBuffer(limit = 100) {
  const values = [];
  return {
    push(value) {
      values.push(value);
      if (values.length > limit) {
        values.splice(0, values.length - limit);
      }
    },
    snapshot() {
      return [...values];
    },
  };
}

async function createRegressionPage(browser, siteUrl, timeoutMs) {
  const page = await browser.newPage();
  const consoleMessages = ringBuffer(100);
  const pageErrors = ringBuffer(50);

  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  page.on("console", (message) => {
    const text = message.text();
    consoleMessages.push(`[${message.type()}] ${text}`);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.stack || error?.message || error));
  });

  await page.goto(siteUrl, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await waitForDebugApi(page, timeoutMs);

  return { page, consoleMessages, pageErrors };
}

async function waitForDebugApi(page, timeoutMs) {
  await page.waitForFunction(() => {
    return Boolean(globalThis.window && window.__URDF_STUDIO_DEBUG__);
  }, { timeout: timeoutMs });

  try {
    await page.evaluate(async () => {
      const api = window.__URDF_STUDIO_DEBUG__;
      const candidateNames = ["ping", "healthCheck", "healthcheck", "ready"];
      for (const name of candidateNames) {
        if (typeof api?.[name] === "function") {
          await api[name]();
          return;
        }
      }
    });
  } catch {
    // ping is optional
  }
}

async function findImportInput(page, timeoutMs) {
  await page.waitForSelector('input[type="file"]', { timeout: timeoutMs });
  const handles = await page.$$('input[type="file"]');
  if (handles.length === 0) {
    fail("Could not find a file input on the page.");
  }

  let bestHandle = handles[0];
  let bestScore = -1;

  for (const handle of handles) {
    const score = await handle.evaluate((element) => {
      if (!(element instanceof HTMLInputElement) || element.type !== "file") {
        return -1;
      }

      const accept = (element.accept || "").toLowerCase();
      let value = 0;
      if (accept.includes(".zip") || accept.includes("zip")) value += 100;
      if (element.multiple) value += 1;
      return value;
    });

    if (score > bestScore) {
      bestScore = score;
      bestHandle = handle;
    }
  }

  return bestHandle;
}

async function importZipIntoPage(page, zipPath, timeoutMs) {
  const inputHandle = await findImportInput(page, timeoutMs);
  await inputHandle.uploadFile(zipPath);
  await delay(100);
  await waitForDebugApi(page, timeoutMs);
}

async function callDebugMethod(page, candidateNames, payload) {
  const result = await page.evaluate(
    async ({ names, methodPayload }) => {
      const api = window.__URDF_STUDIO_DEBUG__;
      if (!api || typeof api !== "object") {
        throw new Error("window.__URDF_STUDIO_DEBUG__ is not available");
      }

      for (const name of names) {
        if (typeof api[name] === "function") {
          return await api[name](methodPayload);
        }
      }

      throw new Error(
        `No debug method found. Tried: ${names.join(", ")}`,
      );
    },
    {
      names: candidateNames,
      methodPayload: payload,
    },
  );

  return result ?? null;
}

async function loadXmlWithDebug(page, modelDir, xmlFile, timeoutMs) {
  return await callDebugMethod(
    page,
    [
      "loadImportedXml",
      "loadImportedXmlFile",
      "loadXmlFile",
      "loadXml",
      "loadMjcfXml",
    ],
    {
      modelDir,
      xmlFile,
      timeoutMs,
    },
  );
}

async function snapshotWithDebug(page, modelDir, xmlFile, timeoutMs, fallbackSnapshot) {
  try {
    return await callDebugMethod(
      page,
      [
        "captureRegressionSnapshot",
        "captureSnapshot",
        "getSnapshot",
        "snapshot",
      ],
      {
        modelDir,
        xmlFile,
        timeoutMs,
      },
    );
  } catch (error) {
    if (fallbackSnapshot && typeof fallbackSnapshot === "object") {
      return fallbackSnapshot;
    }
    throw error;
  }
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeNumberArray(values) {
  if (!Array.isArray(values)) {
    return null;
  }

  const result = [];
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed == null) {
      return null;
    }
    result.push(parsed);
  }

  return result;
}

function normalizeBodyEntry(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const name = typeof body.name === "string" ? body.name : null;
  if (!name) {
    return null;
  }

  return {
    name,
    mass:
      toNumber(body.mass) ??
      toNumber(body.body_mass) ??
      toNumber(body.bodyMass),
    ipos:
      normalizeNumberArray(body.ipos) ??
      normalizeNumberArray(body.center_of_mass) ??
      normalizeNumberArray(body.centerOfMass),
    inertia:
      normalizeNumberArray(body.inertia) ??
      normalizeNumberArray(body.inertial) ??
      normalizeNumberArray(body.body_inertia) ??
      normalizeNumberArray(body.bodyInertia),
    geom_count:
      toNumber(body.geom_count) ??
      toNumber(body.geomCount),
    visual_geom_count:
      toNumber(body.visual_geom_count) ??
      toNumber(body.visualGeomCount) ??
      toNumber(body.visual_count) ??
      toNumber(body.visualCount),
    collision_geom_count:
      toNumber(body.collision_geom_count) ??
      toNumber(body.collisionGeomCount) ??
      toNumber(body.collision_count) ??
      toNumber(body.collisionCount),
  };
}

function normalizeJointEntry(joint) {
  if (!joint || typeof joint !== "object") {
    return null;
  }

  const name = typeof joint.name === "string" ? joint.name : null;
  if (!name) {
    return null;
  }

  return {
    name,
    type: typeof joint.type === "string" ? joint.type : null,
    range: normalizeNumberArray(joint.range),
    axis: normalizeNumberArray(joint.axis),
    qpos0:
      normalizeNumberArray(joint.qpos0) ??
      normalizeNumberArray(joint.initial_qpos) ??
      normalizeNumberArray(joint.initialQpos),
  };
}

function normalizeSnapshot(snapshot) {
  const rawBodies = Array.isArray(snapshot?.per_body)
    ? snapshot.per_body
    : Array.isArray(snapshot?.perBody)
      ? snapshot.perBody
      : Array.isArray(snapshot?.bodies)
        ? snapshot.bodies
        : [];

  const rawJoints = Array.isArray(snapshot?.per_joint)
    ? snapshot.per_joint
    : Array.isArray(snapshot?.perJoint)
      ? snapshot.perJoint
      : Array.isArray(snapshot?.joints)
        ? snapshot.joints
        : [];

  const perBody = rawBodies.map(normalizeBodyEntry).filter(Boolean);
  const perJoint = rawJoints.map(normalizeJointEntry).filter(Boolean);

  return {
    body_count:
      toNumber(snapshot?.body_count) ??
      toNumber(snapshot?.bodyCount) ??
      perBody.length,
    joint_count:
      toNumber(snapshot?.joint_count) ??
      toNumber(snapshot?.jointCount) ??
      perJoint.length,
    geom_count:
      toNumber(snapshot?.geom_count) ??
      toNumber(snapshot?.geomCount) ??
      perBody.reduce((sum, body) => sum + (body.geom_count ?? 0), 0),
    total_mass:
      toNumber(snapshot?.total_mass) ??
      toNumber(snapshot?.totalMass) ??
      perBody.reduce((sum, body) => sum + (body.mass ?? 0), 0),
    per_body: perBody,
    per_joint: perJoint,
  };
}

function buildTruthSummary(entry) {
  const perBody = Array.isArray(entry.per_body) ? entry.per_body.map(normalizeBodyEntry).filter(Boolean) : [];
  const perJoint = Array.isArray(entry.per_joint) ? entry.per_joint.map(normalizeJointEntry).filter(Boolean) : [];
  const visualGeomCount = perBody.reduce(
    (sum, body) => sum + (body.visual_geom_count ?? 0),
    0,
  );
  const collisionGeomCount = perBody.reduce(
    (sum, body) => sum + (body.collision_geom_count ?? 0),
    0,
  );
  const inertiaTraceTotal = perBody.reduce((sum, body) => {
    if (!Array.isArray(body.inertia)) {
      return sum;
    }
    return sum + body.inertia.reduce((inner, value) => inner + value, 0);
  }, 0);

  return {
    body_count: toNumber(entry.body_count) ?? perBody.length,
    joint_count: toNumber(entry.joint_count) ?? perJoint.length,
    geom_count:
      toNumber(entry.geom_count) ??
      perBody.reduce((sum, body) => sum + (body.geom_count ?? 0), 0),
    total_mass:
      toNumber(entry.total_mass) ??
      perBody.reduce((sum, body) => sum + (body.mass ?? 0), 0),
    visual_geom_count_total: visualGeomCount,
    collision_geom_count_total: collisionGeomCount,
    inertia_trace_total: inertiaTraceTotal,
    per_body: perBody,
    per_joint: perJoint,
    body_names: perBody.map((body) => body.name).sort(),
    joint_names: perJoint.map((joint) => joint.name).sort(),
  };
}

function buildSnapshotSummary(snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  const visualGeomCount = normalized.per_body.reduce(
    (sum, body) => sum + (body.visual_geom_count ?? 0),
    0,
  );
  const collisionGeomCount = normalized.per_body.reduce(
    (sum, body) => sum + (body.collision_geom_count ?? 0),
    0,
  );
  const inertiaTraceTotal = normalized.per_body.reduce((sum, body) => {
    if (!Array.isArray(body.inertia)) {
      return sum;
    }
    return sum + body.inertia.reduce((inner, value) => inner + value, 0);
  }, 0);

  return {
    body_count: normalized.body_count,
    joint_count: normalized.joint_count,
    geom_count: normalized.geom_count,
    total_mass: normalized.total_mass,
    visual_geom_count_total: visualGeomCount,
    collision_geom_count_total: collisionGeomCount,
    inertia_trace_total: inertiaTraceTotal,
    per_body: normalized.per_body,
    per_joint: normalized.per_joint,
    body_names: normalized.per_body.map((body) => body.name).sort(),
    joint_names: normalized.per_joint.map((joint) => joint.name).sort(),
  };
}

function numbersClose(left, right, tolerance) {
  return Math.abs(left - right) <= tolerance;
}

function arraysClose(left, right, tolerance) {
  if (!Array.isArray(left) && !Array.isArray(right)) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!numbersClose(left[index], right[index], tolerance)) {
      return false;
    }
  }
  return true;
}

function compareScalar(diffFields, field, truthValue, snapshotValue, tolerance) {
  if (truthValue == null && snapshotValue == null) {
    return;
  }

  if (typeof truthValue === "number" || typeof snapshotValue === "number") {
    if (truthValue == null || snapshotValue == null) {
      diffFields.push({
        field,
        truth: truthValue,
        snapshot: snapshotValue,
      });
      return;
    }

    if (!numbersClose(truthValue, snapshotValue, tolerance)) {
      diffFields.push({
        field,
        truth: truthValue,
        snapshot: snapshotValue,
        delta: snapshotValue - truthValue,
      });
    }
    return;
  }

  if (Array.isArray(truthValue) || Array.isArray(snapshotValue)) {
    if (!arraysClose(truthValue, snapshotValue, tolerance)) {
      diffFields.push({
        field,
        truth: truthValue,
        snapshot: snapshotValue,
      });
    }
    return;
  }

  if (truthValue !== snapshotValue) {
    diffFields.push({
      field,
      truth: truthValue,
      snapshot: snapshotValue,
    });
  }
}

function mapByName(entries) {
  const mapped = new Map();
  for (const entry of entries) {
    if (entry?.name) {
      mapped.set(entry.name, entry);
    }
  }
  return mapped;
}

function compareNamedEntries(diffFields, prefix, truthEntries, snapshotEntries, tolerance) {
  const truthMap = mapByName(truthEntries);
  const snapshotMap = mapByName(snapshotEntries);

  for (const name of truthMap.keys()) {
    if (!snapshotMap.has(name)) {
      diffFields.push({
        field: `${prefix}.${name}`,
        truth: truthMap.get(name),
        snapshot: null,
        reason: "missing_in_snapshot",
      });
    }
  }

  for (const name of snapshotMap.keys()) {
    if (!truthMap.has(name)) {
      diffFields.push({
        field: `${prefix}.${name}`,
        truth: null,
        snapshot: snapshotMap.get(name),
        reason: "extra_in_snapshot",
      });
    }
  }

  for (const [name, truthEntry] of truthMap.entries()) {
    const snapshotEntry = snapshotMap.get(name);
    if (!snapshotEntry) {
      continue;
    }

    for (const key of Object.keys(truthEntry)) {
      if (key === "name") {
        continue;
      }
      compareScalar(
        diffFields,
        `${prefix}.${name}.${key}`,
        truthEntry[key],
        snapshotEntry[key],
        tolerance,
      );
    }
  }
}

function computeDiffFields(truthSummary, snapshotSummary, tolerance) {
  const diffFields = [];

  compareScalar(diffFields, "body_count", truthSummary.body_count, snapshotSummary.body_count, tolerance);
  compareScalar(diffFields, "joint_count", truthSummary.joint_count, snapshotSummary.joint_count, tolerance);
  compareScalar(diffFields, "geom_count", truthSummary.geom_count, snapshotSummary.geom_count, tolerance);
  compareScalar(diffFields, "total_mass", truthSummary.total_mass, snapshotSummary.total_mass, tolerance);
  compareScalar(
    diffFields,
    "visual_geom_count_total",
    truthSummary.visual_geom_count_total,
    snapshotSummary.visual_geom_count_total,
    tolerance,
  );
  compareScalar(
    diffFields,
    "collision_geom_count_total",
    truthSummary.collision_geom_count_total,
    snapshotSummary.collision_geom_count_total,
    tolerance,
  );
  compareScalar(
    diffFields,
    "inertia_trace_total",
    truthSummary.inertia_trace_total,
    snapshotSummary.inertia_trace_total,
    tolerance,
  );
  compareScalar(
    diffFields,
    "body_names",
    truthSummary.body_names,
    snapshotSummary.body_names,
    tolerance,
  );
  compareScalar(
    diffFields,
    "joint_names",
    truthSummary.joint_names,
    snapshotSummary.joint_names,
    tolerance,
  );

  compareNamedEntries(
    diffFields,
    "per_body",
    truthSummary.per_body,
    snapshotSummary.per_body,
    tolerance,
  );
  compareNamedEntries(
    diffFields,
    "per_joint",
    truthSummary.per_joint,
    snapshotSummary.per_joint,
    tolerance,
  );

  return diffFields;
}

function buildModelErrorResults(modelDir, entries, zipPath, error) {
  return {
    model_dir: modelDir,
    zip_path: zipPath,
    import_ok: false,
    import_error: error,
    xml_results: entries.map((entry) => {
      const compileError =
        !entry.compile_ok && entry.error
          ? `compile_ok=false in truth manifest: ${entry.error}`
          : null;

      return {
        model_dir: modelDir,
        xml_file: entry.xml_file,
        load_ok: false,
        error: compileError ?? error,
        snapshot_summary: null,
        truth_summary: buildTruthSummary(entry),
        diff_fields: [
          {
            field: entry.compile_ok ? "model_import" : "compile_ok",
            truth: entry.compile_ok ? "imported" : false,
            snapshot: entry.compile_ok ? "failed" : null,
            reason: compileError ?? error,
          },
        ],
      };
    }),
  };
}

async function runModelRegression(browser, siteUrl, modelDir, entries, zipPath, options) {
  console.log(`\n[${modelDir}] importing ${path.relative(process.cwd(), zipPath)}`);
  const compileOkEntries = entries.filter((entry) => entry.compile_ok);
  const skippedEntries = entries.filter((entry) => !entry.compile_ok);
  const { page, consoleMessages, pageErrors } = await createRegressionPage(
    browser,
    siteUrl,
    options.timeoutMs,
  );

  try {
    try {
      await importZipIntoPage(page, zipPath, options.timeoutMs);
    } catch (error) {
      const diagnostics = [
        `Import failed for model_dir=${modelDir}: ${String(error?.stack || error?.message || error)}`,
        ...pageErrors.snapshot(),
        ...consoleMessages.snapshot(),
      ]
        .filter(Boolean)
        .join("\n");
      return buildModelErrorResults(modelDir, entries, zipPath, diagnostics);
    }

    const xmlResults = [];

    for (const entry of compileOkEntries) {
      const truthSummary = buildTruthSummary(entry);
      let loadOk = false;
      let errorMessage = null;
      let snapshotSummary = null;
      let diffFields = [];

      console.log(`[${modelDir}] xml=${entry.xml_file}`);

      try {
        const loadResult = await loadXmlWithDebug(
          page,
          modelDir,
          entry.xml_file,
          options.timeoutMs,
        );
        const snapshot = await snapshotWithDebug(
          page,
          modelDir,
          entry.xml_file,
          options.timeoutMs,
          loadResult?.snapshot ?? null,
        );
        snapshotSummary = buildSnapshotSummary(snapshot);
        diffFields = computeDiffFields(
          truthSummary,
          snapshotSummary,
          options.floatTolerance,
        );
        loadOk = true;
      } catch (error) {
        errorMessage = String(error?.stack || error?.message || error);
      }

      if (!loadOk) {
        const diagnostics = [...pageErrors.snapshot(), ...consoleMessages.snapshot()]
          .filter(Boolean)
          .slice(-20);
        if (diagnostics.length > 0) {
          errorMessage = `${errorMessage}\n${diagnostics.join("\n")}`;
        }
      }

      xmlResults.push({
        model_dir: modelDir,
        xml_file: entry.xml_file,
        xml_relpath: entry.xml_relpath ?? null,
        load_ok: loadOk,
        error: errorMessage,
        snapshot_summary: snapshotSummary,
        truth_summary: truthSummary,
        diff_fields: diffFields,
      });
    }

    for (const entry of skippedEntries) {
      xmlResults.push({
        model_dir: modelDir,
        xml_file: entry.xml_file,
        xml_relpath: entry.xml_relpath ?? null,
        load_ok: false,
        error: `compile_ok=false in truth manifest: ${entry.error ?? "unknown compile error"}`,
        snapshot_summary: null,
        truth_summary: buildTruthSummary(entry),
        diff_fields: [
          {
            field: "compile_ok",
            truth: false,
            snapshot: null,
            reason: entry.error ?? "compile_ok=false",
          },
        ],
      });
    }

    return {
      model_dir: modelDir,
      zip_path: zipPath,
      import_ok: true,
      import_error: null,
      xml_results: xmlResults,
    };
  } finally {
    try {
      await page.close();
    } catch {
      // ignore
    }
  }
}

function summarizeRun(results) {
  const modelCount = results.length;
  const xmlResults = results.flatMap((result) => result.xml_results);
  const loadOkCount = xmlResults.filter((result) => result.load_ok).length;
  const loadErrorCount = xmlResults.length - loadOkCount;
  const diffCount = xmlResults.reduce(
    (sum, result) => sum + (Array.isArray(result.diff_fields) ? result.diff_fields.length : 0),
    0,
  );
  const importErrorCount = results.filter((result) => !result.import_ok).length;

  return {
    model_count: modelCount,
    xml_count: xmlResults.length,
    load_ok_count: loadOkCount,
    load_error_count: loadErrorCount,
    import_error_count: importErrorCount,
    diff_count: diffCount,
  };
}

async function safelyCloseBrowser(browser) {
  if (!browser) {
    return;
  }

  try {
    await browser.close();
  } catch {
    try {
      const processHandle = browser.process?.();
      processHandle?.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const truthManifest = await readJson(options.truthPath);
  assertTruthManifest(truthManifest);

  const groupedEntries = groupTruthEntries(truthManifest, options.modelDirs);
  if (groupedEntries.size === 0) {
    fail("No truth entries matched the requested model_dir filters.");
  }

  const zipCandidates = await listZipCandidates(options.regressionRoot);
  const siteHandle = await ensureSite(options.siteUrl, options);
  const browser = await launchBrowser(options);

  const cleanupHandlers = [
    async () => safelyCloseBrowser(browser),
    async () => siteHandle.stop(),
  ];

  const terminate = async (signal) => {
    console.error(`\nReceived ${signal}, cleaning up...`);
    for (const handler of cleanupHandlers) {
      try {
        await handler();
      } catch {
        // ignore
      }
    }
    process.exit(1);
  };

  process.once("SIGINT", () => void terminate("SIGINT"));
  process.once("SIGTERM", () => void terminate("SIGTERM"));

  const modelResults = [];

  try {
    for (const [modelDir, entries] of groupedEntries.entries()) {
      let zipPath = null;
      try {
        zipPath = await resolveZipPath(
          modelDir,
          entries,
          options.regressionRoot,
          zipCandidates,
        );
      } catch (error) {
        modelResults.push(
          buildModelErrorResults(
            modelDir,
            entries,
            zipPath,
            String(error?.stack || error?.message || error),
          ),
        );
        continue;
      }

      const result = await runModelRegression(
        browser,
        siteHandle.siteUrl,
        modelDir,
        entries,
        zipPath,
        options,
      );
      modelResults.push(result);
    }
  } finally {
    await safelyCloseBrowser(browser);
    await siteHandle.stop();
  }

  const output = {
    generated_at: new Date().toISOString(),
    generator: "scripts/regression/run_menagerie_browser_regression.mjs",
    site_url: siteHandle.siteUrl,
    site_started_by_script: siteHandle.startedByScript,
    truth_path: options.truthPath,
    output_path: options.outputPath,
    regression_root: options.regressionRoot,
    model_dirs: [...groupedEntries.keys()],
    summary: summarizeRun(modelResults),
    results: modelResults,
  };

  await writeJsonAtomic(options.outputPath, output);
  console.log(`\nWrote browser regression results to ${options.outputPath}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
