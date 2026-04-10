#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const viteBin = path.resolve(repoRoot, 'node_modules', '.bin', 'vite');
const args = process.argv.slice(2);
const DEFAULT_PORT_SEARCH_ATTEMPTS = 20;

function getFlagValue(flagName, fallbackValue) {
  const directIndex = args.findIndex((arg) => arg === flagName);
  if (directIndex >= 0) {
    return args[directIndex + 1] ?? fallbackValue;
  }

  const prefixedArg = args.find((arg) => arg.startsWith(`${flagName}=`));
  if (!prefixedArg) return fallbackValue;
  return prefixedArg.slice(flagName.length + 1) || fallbackValue;
}

function hasFlag(flagName) {
  return args.includes(flagName) || args.some((arg) => arg.startsWith(`${flagName}=`));
}

function runStep(command, stepArgs) {
  const result = spawnSync(command, stepArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (connected) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function getListeningPids(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0 && result.status !== 1) {
    return [];
  }

  const pids = result.stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  return Array.from(new Set(pids));
}

function getProcessArgs(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'args='], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function getProcessCwd(pid) {
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return '';
  }
}

function isRepoViteProcess(pid) {
  const commandLine = getProcessArgs(pid);
  const processCwd = getProcessCwd(pid);

  return (
    processCwd === repoRoot &&
    commandLine.includes('vite') &&
    (commandLine.includes(repoRoot) || commandLine.includes('node_modules/.bin/vite'))
  );
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return !isProcessAlive(pid);
}

async function waitForPortRelease(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await canConnect(host, port))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return !(await canConnect(host, port));
}

async function terminateRepoViteProcesses(pids, host, port) {
  for (const pid of pids) {
    if (!isProcessAlive(pid)) {
      continue;
    }

    console.log(`[dev] Stopping existing URDF Studio dev server (pid ${pid})...`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dev] Failed to terminate pid ${pid}: ${message}`);
      process.exit(1);
    }
  }

  const exitedAfterTerm = await Promise.all(pids.map((pid) => waitForProcessExit(pid, 5000)));
  if (exitedAfterTerm.every(Boolean) && (await waitForPortRelease(host, port, 5000))) {
    return;
  }

  for (const pid of pids) {
    if (!isProcessAlive(pid)) {
      continue;
    }

    console.warn(`[dev] pid ${pid} did not exit after SIGTERM, forcing shutdown...`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dev] Failed to force-stop pid ${pid}: ${message}`);
      process.exit(1);
    }
  }

  const exitedAfterKill = await Promise.all(pids.map((pid) => waitForProcessExit(pid, 5000)));
  if (!exitedAfterKill.every(Boolean) || !(await waitForPortRelease(host, port, 5000))) {
    console.error(`[dev] Timed out waiting for port ${port} on ${host} to become available.`);
    process.exit(1);
  }
}

function upsertFlagValue(existingArgs, flagName, flagValue) {
  const nextArgs = [];
  let replaced = false;

  for (let index = 0; index < existingArgs.length; index += 1) {
    const arg = existingArgs[index];
    if (arg === flagName) {
      nextArgs.push(flagName, String(flagValue));
      index += 1;
      replaced = true;
      continue;
    }

    if (arg.startsWith(`${flagName}=`)) {
      nextArgs.push(`${flagName}=${flagValue}`);
      replaced = true;
      continue;
    }

    nextArgs.push(arg);
  }

  if (!replaced) {
    nextArgs.push(flagName, String(flagValue));
  }

  return nextArgs;
}

export async function findNextAvailablePort(
  host,
  startPort,
  canConnectFn = canConnect,
  maxAttempts = DEFAULT_PORT_SEARCH_ATTEMPTS,
) {
  for (let port = startPort; port < startPort + maxAttempts; port += 1) {
    if (!(await canConnectFn(host, port))) {
      return port;
    }
  }

  throw new Error(
    `[dev] Could not find a free port starting from ${startPort} on ${host} after ${maxAttempts} attempts.`,
  );
}

export async function resolvePortConflict({
  host,
  preferredPort,
  strictPort,
  restartExisting,
  canConnectFn = canConnect,
  getListeningPidsFn = getListeningPids,
  isRepoViteProcessFn = isRepoViteProcess,
  getProcessArgsFn = getProcessArgs,
  maxFallbackAttempts = DEFAULT_PORT_SEARCH_ATTEMPTS,
}) {
  const reachable = await canConnectFn(host, preferredPort);
  if (!reachable) {
    return { action: 'start', port: preferredPort, requestedPort: preferredPort };
  }

  const listeningPids = getListeningPidsFn(preferredPort);
  const repoVitePids = listeningPids.filter((pid) => isRepoViteProcessFn(pid));
  if (repoVitePids.length > 0) {
    if (restartExisting) {
      return {
        action: 'restart-existing',
        port: preferredPort,
        requestedPort: preferredPort,
        repoVitePids,
      };
    }

    return {
      action: 'reuse-existing',
      port: preferredPort,
      requestedPort: preferredPort,
      repoVitePids,
    };
  }

  const conflictingPid = listeningPids[0];
  const conflictingCommand = conflictingPid ? getProcessArgsFn(conflictingPid) : '';

  if (strictPort) {
    return {
      action: 'error',
      port: preferredPort,
      requestedPort: preferredPort,
      conflictingPid,
      conflictingCommand,
    };
  }

  const fallbackPort = await findNextAvailablePort(
    host,
    preferredPort + 1,
    canConnectFn,
    maxFallbackAttempts,
  );

  return {
    action: 'start',
    port: fallbackPort,
    requestedPort: preferredPort,
    reassigned: true,
    conflictingPid,
    conflictingCommand,
  };
}

export function buildViteArgs(existingArgs, { host, port }) {
  let nextArgs = [...existingArgs];
  nextArgs = upsertFlagValue(nextArgs, '--host', host);
  nextArgs = upsertFlagValue(nextArgs, '--port', port);
  return nextArgs;
}

async function main() {
  const shouldGenerate = hasFlag('--generate');
  const host = getFlagValue('--host', '127.0.0.1');
  const portValue = getFlagValue('--port', '3000');
  const port = Number.parseInt(portValue, 10);
  const strictPort = hasFlag('--strictPort');
  const restartExisting = hasFlag('--restart-existing');

  if (!Number.isInteger(port) || port <= 0) {
    console.error(`[dev] Invalid port: ${portValue}`);
    process.exit(1);
  }

  if (shouldGenerate) {
    runStep('npm', ['run', 'generate']);
  } else {
    runStep('npm', ['run', 'generate:check']);
  }

  const portResolution = await resolvePortConflict({
    host,
    preferredPort: port,
    strictPort,
    restartExisting,
  });

  if (portResolution.action === 'reuse-existing') {
    console.log(
      `[dev] Reusing existing URDF Studio dev server on ${host}:${portResolution.port} (pid ${portResolution.repoVitePids[0]}).`,
    );
    return;
  }

  if (portResolution.action === 'restart-existing') {
    await terminateRepoViteProcesses(portResolution.repoVitePids, host, portResolution.port);
  } else if (portResolution.action === 'error') {
    console.error(`[dev] Port ${portResolution.port} is already in use on ${host}.`);
    if (portResolution.conflictingPid) {
      console.error(`[dev] Conflicting pid: ${portResolution.conflictingPid}`);
    }
    if (portResolution.conflictingCommand) {
      console.error(`[dev] Command: ${portResolution.conflictingCommand}`);
    }
    process.exit(1);
  } else if (portResolution.reassigned) {
    console.warn(
      `[dev] Port ${portResolution.requestedPort} is busy on ${host}; starting dev server on ${portResolution.port} instead.`,
    );
    if (portResolution.conflictingPid) {
      console.warn(
        `[dev] Existing pid on ${portResolution.requestedPort}: ${portResolution.conflictingPid}`,
      );
    }
  }

  const viteArgs = buildViteArgs(
    args.filter((arg) => arg !== '--generate' && arg !== '--restart-existing'),
    { host, port: portResolution.port },
  );
  const child = spawn(viteBin, viteArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

const invokedScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const currentScriptPath = fileURLToPath(import.meta.url);

if (invokedScriptPath === currentScriptPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
