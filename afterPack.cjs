// afterPack hook for electron-builder
// 1. Copies resources/openclaw/node_modules/ into the build output
//    (electron-builder's default filters strip node_modules from extraResources)
// 2. Prunes files not needed at runtime to reduce file count
//    (avoids EMFILE during macOS code signing — kernel caps open files ~24K)
const path = require("path");
const fs = require("fs");

// Extensions to delete (not needed at runtime)
const PRUNE_EXTENSIONS = new Set([
  ".map",
  ".d.ts",
  ".d.mts",
  ".d.cts",
  ".ts.map",
]);

// Filename patterns to delete
const PRUNE_FILE_PATTERNS = [
  /^README/i,
  /^CHANGELOG/i,
  /^HISTORY/i,
  /^AUTHORS/i,
  /^CONTRIBUTORS/i,
  /^\.npmignore$/,
  /^\.eslintrc/,
  /^\.prettierrc/,
  /^tsconfig.*\.json$/,
  /^\.editorconfig$/,
  /^\.gitattributes$/,
  /^Makefile$/i,
  /^Gruntfile/i,
  /^Gulpfile/i,
  /^\.travis\.yml$/,
  /^appveyor\.yml$/,
  /^\.babelrc/,
  /^jest\.config/,
  /^karma\.conf/,
  /^\.zuul\.yml$/,
];

// Directory names to delete entirely
const PRUNE_DIRS = new Set([
  ".bin",
  ".github",
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "example",
  "examples",
  "doc",
  "docs",
  "coverage",
  ".nyc_output",
  "benchmark",
  "benchmarks",
  ".idea",
  ".vscode",
]);

// Extensions that must NEVER be pruned (runtime files)
const KEEP_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".json", ".node", ".wasm",
  ".so", ".dylib", ".dll", ".exe",
]);

function containsRuntimeFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (containsRuntimeFiles(full)) return true;
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (KEEP_EXTENSIONS.has(ext)) return true;
    }
  }
  return false;
}

function shouldPruneFile(name) {
  const ext = path.extname(name).toLowerCase();
  if (KEEP_EXTENSIONS.has(ext)) return false;

  for (const pruneExt of PRUNE_EXTENSIONS) {
    if (name.endsWith(pruneExt)) return true;
  }
  for (const pattern of PRUNE_FILE_PATTERNS) {
    if (pattern.test(name)) return true;
  }
  return false;
}

function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(full);
    } else {
      count++;
    }
  }
  return count;
}

function pruneDir(dir) {
  let removed = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name) && !containsRuntimeFiles(full)) {
        fs.rmSync(full, { recursive: true, force: true });
        removed++;
      } else {
        removed += pruneDir(full);
      }
    } else if (entry.isFile() && shouldPruneFile(entry.name)) {
      fs.unlinkSync(full);
      removed++;
    }
  }

  // Remove directory if now empty
  try {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch {
    // ignore
  }

  return removed;
}

exports.default = async function (context) {
  const platform = context.electronPlatformName;

  let resourcesDir;
  if (platform === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(
      context.appOutDir,
      `${appName}.app`,
      "Contents",
      "Resources"
    );
  } else {
    resourcesDir = path.join(context.appOutDir, "resources");
  }

  const source = path.join(
    context.packager.projectDir,
    "resources",
    "openclaw",
    "node_modules"
  );
  const dest = path.join(resourcesDir, "openclaw", "node_modules");

  if (!fs.existsSync(source)) {
    console.warn(
      "[afterPack] resources/openclaw/node_modules not found — skipping. Run scripts/bundle-openclaw.sh first."
    );
    return;
  }

  if (fs.existsSync(dest)) {
    console.log("[afterPack] openclaw/node_modules already exists — skipping.");
    return;
  }

  // Step 1: Copy node_modules to build output
  console.log("[afterPack] Copying openclaw/node_modules to build output...");
  fs.cpSync(source, dest, { recursive: true, dereference: true });

  // Step 2: Prune files not needed at runtime (reduces file count for code signing)
  const beforeCount = countFiles(dest);
  console.log(`[afterPack] Pruning unnecessary files (${beforeCount} files before)...`);
  pruneDir(dest);
  const afterCount = countFiles(dest);
  console.log(`[afterPack] Pruned: ${beforeCount} → ${afterCount} files (removed ${beforeCount - afterCount})`);
};
