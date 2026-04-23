#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const dockerArgs = process.argv.slice(2);
const timeoutMs = parsePositiveInteger(
  process.env.DOCKER_READY_TIMEOUT_MS,
  60_000,
);
const pollMs = parsePositiveInteger(process.env.DOCKER_READY_POLL_MS, 2_000);

if (dockerArgs.length === 0) {
  console.error("Usage: node scripts/wait-for-docker.cjs <docker args...>");
  process.exit(1);
}

process.stderr.write("Waiting for Docker engine");

const deadline = Date.now() + timeoutMs;
let lastFailure = "";

while (Date.now() <= deadline) {
  const result = runDocker(["info"]);

  if (!result.error && result.status === 0) {
    process.stderr.write(" ready.\n");
    const command = runDocker(dockerArgs, { stdio: "inherit" });

    if (command.error) {
      console.error(`Failed to launch docker: ${command.error.message}`);
      process.exit(1);
    }

    process.exit(command.status ?? 1);
  }

  if (result.error?.code === "ENOENT") {
    console.error("\nDocker CLI was not found in PATH.");
    process.exit(1);
  }

  lastFailure = summarizeFailure(result);
  process.stderr.write(".");
  sleep(pollMs);
}

process.stderr.write("\n");
console.error(
  `Docker did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`,
);

if (lastFailure) {
  console.error(lastFailure);
}

process.exit(1);

function runDocker(args, options = {}) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function summarizeFailure(result) {
  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();

  if (stderr) {
    return stderr;
  }

  if (stdout) {
    return stdout;
  }

  if (result.error) {
    return result.error.message;
  }

  if (typeof result.status === "number") {
    return `docker exited with status ${result.status}.`;
  }

  return "";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
