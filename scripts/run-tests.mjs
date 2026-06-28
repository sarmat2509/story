#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_TIMEOUT_MS = 120_000;
const SLOW_TEST_FILES = new Set([
  'services/api/src/services/__tests__/imageRateLimiter.test.ts',
]);
const IGNORED_DIRS = new Set([
  '.cache',
  '.expo',
  '.git',
  '.next',
  '.pnpm-store',
  'build',
  'coverage',
  'DerivedData',
  'dist',
  'node_modules',
  'Pods',
  'uploads',
]);

function parseArgs(argv) {
  const options = {
    bail: false,
    includeIntegration: false,
    includeSlow: false,
    list: false,
    patterns: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    } else if (arg === '--all') {
      options.includeIntegration = true;
      options.includeSlow = true;
    } else if (arg === '--include-integration') {
      options.includeIntegration = true;
    } else if (arg === '--include-slow') {
      options.includeSlow = true;
    } else if (arg === '--bail') {
      options.bail = true;
    } else if (arg === '--list') {
      options.list = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--timeout') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--timeout expects a positive number of milliseconds');
      }
      options.timeoutMs = Math.round(value);
      index += 1;
    } else if (arg.startsWith('--timeout=')) {
      const value = Number(arg.slice('--timeout='.length));
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--timeout expects a positive number of milliseconds');
      }
      options.timeoutMs = Math.round(value);
    } else if (arg === '--pattern') {
      const value = argv[index + 1];
      if (!value) throw new Error('--pattern expects a path substring or RegExp source');
      options.patterns.push(value);
      index += 1;
    } else if (arg.startsWith('--pattern=')) {
      options.patterns.push(arg.slice('--pattern='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.patterns.push(arg);
    }
  }

  return options;
}

function printHelp() {
  console.log(`WonderTales test runner

Usage:
  pnpm test
  pnpm test -- --pattern graphicNovel
  pnpm test:all

Options:
  --all, --include-integration  Include *.integration.ts(x) files.
  --include-slow                Include slow/manual tests.
  --bail                       Stop after the first failure.
  --list                       Print discovered test files without running them.
  --pattern <text>             Run files whose repo-relative path contains <text>.
  --timeout <ms>               Per-test timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --verbose                    Print full output for passing tests too.
`);
}

function shouldSkipDir(name) {
  return IGNORED_DIRS.has(name);
}

function isRunnableTestFile(relativePath, options) {
  if (/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/.test(relativePath)) {
    return true;
  }
  return options.includeIntegration && /\.integration\.(ts|tsx|js|mjs|cjs)$/.test(relativePath);
}

function isSlowTestFile(relativePath) {
  return SLOW_TEST_FILES.has(relativePath);
}

async function walk(dir, options, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        await walk(path.join(dir, entry.name), options, files);
      }
      continue;
    }

    if (!entry.isFile()) continue;
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, absolutePath).replaceAll(path.sep, '/');
    if (isRunnableTestFile(relativePath, options)) {
      files.push(relativePath);
    }
  }
  return files;
}

async function findPackageRoots() {
  const roots = [ROOT];
  const workspaceDirs = ['apps', 'services', 'packages'];
  for (const workspaceDir of workspaceDirs) {
    const absoluteWorkspaceDir = path.join(ROOT, workspaceDir);
    let entries = [];
    try {
      entries = await fs.readdir(absoluteWorkspaceDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(absoluteWorkspaceDir, entry.name);
      try {
        await fs.access(path.join(candidate, 'package.json'));
        roots.push(candidate);
      } catch {
        // Not a package root.
      }
    }
  }
  return roots.sort((a, b) => b.length - a.length);
}

function packageRootForFile(file, packageRoots) {
  const absoluteFile = path.join(ROOT, file);
  return packageRoots.find((packageRoot) => {
    const relative = path.relative(packageRoot, absoluteFile);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  }) ?? ROOT;
}

function commandForFile(file, packageRoots) {
  const cwd = packageRootForFile(file, packageRoots);
  const relativeToPackage = path.relative(cwd, path.join(ROOT, file));
  if (/\.(ts|tsx)$/.test(file)) {
    return {
      command: 'pnpm',
      args: ['exec', 'tsx', '--require', path.join(ROOT, 'scripts/test-globals.cjs'), relativeToPackage],
      cwd,
    };
  }
  return {
    command: process.execPath,
    args: ['-r', path.join(ROOT, 'scripts/test-globals.cjs'), relativeToPackage],
    cwd,
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function tailLines(text, maxLines = 120) {
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.slice(-maxLines).join('\n');
}

function runCommand(test, commandSpec, logPath, options) {
  return new Promise((resolve) => {
    const start = Date.now();
    const outputChunks = [];
    const logStream = createWriteStream(logPath, { flags: 'w' });
    const child = spawn(commandSpec.command, commandSpec.args, {
      cwd: commandSpec.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3_000).unref();
    }, options.timeoutMs);

    const collect = (chunk) => {
      outputChunks.push(chunk);
      logStream.write(chunk);
      if (options.verbose) {
        process.stdout.write(chunk);
      }
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      logStream.end();
      const durationMs = Date.now() - start;
      const output = Buffer.concat(outputChunks).toString('utf8');
      resolve({
        test,
        code,
        signal,
        timedOut,
        durationMs,
        output,
        logPath,
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const discoveredFiles = await walk(ROOT, options);
  const matchesPattern = (file) =>
    options.patterns.length === 0
      ? true
      : options.patterns.some((pattern) => file.includes(pattern));
  const matchingFiles = discoveredFiles.filter(matchesPattern);
  const skippedSlowFiles = matchingFiles.filter((file) => isSlowTestFile(file) && !options.includeSlow);
  let files = matchingFiles
    .filter((file) => options.includeSlow || !isSlowTestFile(file))
    .sort((a, b) => a.localeCompare(b));

  if (options.list) {
    files.forEach((file) => console.log(file));
    console.log(`\n${files.length} test file(s) discovered.`);
    if (!options.includeIntegration) {
      console.log('Integration tests are skipped by default. Use --include-integration to include them.');
    }
    if (skippedSlowFiles.length > 0) {
      console.log(`${skippedSlowFiles.length} slow/manual test file(s) skipped. Use --include-slow to include them.`);
    }
    return;
  }

  if (files.length === 0) {
    console.log('No test files matched.');
    return;
  }

  const packageRoots = await findPackageRoots();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(ROOT, '.cache', 'test-runs', runId);
  await fs.mkdir(logDir, { recursive: true });

  console.log(`Running ${files.length} test file(s). Logs: ${path.relative(ROOT, logDir)}`);
  if (!options.includeIntegration) {
    console.log('Integration tests are skipped by default. Use pnpm test:all to include them.');
  }
  if (skippedSlowFiles.length > 0) {
    console.log(`${skippedSlowFiles.length} slow/manual test file(s) skipped. Use --include-slow to include them.`);
  }

  const results = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const commandSpec = commandForFile(file, packageRoots);
    const logPath = path.join(logDir, `${String(index + 1).padStart(3, '0')}.log`);
    const prefix = `[${String(index + 1).padStart(3, '0')}/${String(files.length).padStart(3, '0')}]`;
    process.stdout.write(`${prefix} ${file} ... `);
    const result = await runCommand(file, commandSpec, logPath, options);
    results.push(result);

    if (result.code === 0 && !result.timedOut) {
      console.log(`PASS ${formatDuration(result.durationMs)}`);
    } else {
      const status = result.timedOut
        ? `TIMEOUT ${formatDuration(options.timeoutMs)}`
        : `FAIL ${result.code ?? result.signal}`;
      console.log(`${status} ${formatDuration(result.durationMs)} (${path.relative(ROOT, result.logPath)})`);
      if (options.bail) break;
    }
  }

  const passed = results.filter((result) => result.code === 0 && !result.timedOut);
  const failed = results.filter((result) => result.code !== 0 || result.timedOut);
  console.log('');
  console.log(`Summary: ${passed.length}/${results.length} passed, ${failed.length} failed.`);
  console.log(`Logs: ${path.relative(ROOT, logDir)}`);

  if (failed.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const result of failed) {
      console.log('');
      console.log(`===== ${result.test} =====`);
      console.log(`Log: ${path.relative(ROOT, result.logPath)}`);
      console.log(tailLines(result.output));
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
