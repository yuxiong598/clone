// Prints locations and categories only, never credential values. No dependencies required.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const excluded = new Set([".git", "node_modules", ".yarn", ".next", "artifacts", "cache", "typechain-types"]);
const findings = new Set();
let scanned = 0;

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 128 * 1024 * 1024, ...options });
}

function isPrivateEnv(file) {
  const name = path.posix.basename(file.replaceAll("\\", "/"));
  return name.startsWith(".env") && ![".env.example", ".env.local.example"].includes(name);
}

function scan(file, content) {
  if (content.includes(0)) return; // Skip binary assets.
  scanned++;
  const lines = content.toString("utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const location = `${file}:${index + 1}`;
    // Public deployment receipt hashes are not signing keys. Check named credentials separately.
    const withoutPublicHashes = line.replace(
      /(?:\\?")(?:transactionHash|blockHash|txHash|keccak256)(?:\\?")\s*:\s*(?:\\?")0x[\da-f]{64}(?:\\?")/gi,
      "[public hash]",
    );
    if (/(?<![\da-f])(?:0x)?[\da-f]{64}(?![\da-f])/i.test(withoutPublicHashes)) {
      findings.add(`${location} [64-hex literal; review key vs public hash]`);
    }
    // Named credentials catch quoted mnemonic/encoded key strings and filled dotenv values too.
    if (/(?:private[_-]?key|mnemonic|seed[_-]?phrase|secret[_-]?key)(?:_encrypted)?["']?\s*[:=]\s*["'`]([^"'`\r\n]+)["'`]/i.test(line) ||
        /^\s*(?:DEPLOYER_PRIVATE_KEY(?:_ENCRYPTED)?|PRIVATE_KEY|MNEMONIC|SEED_PHRASE)\s*=\s*\S+/i.test(line)) {
      findings.add(`${location} [credential literal or populated environment value]`);
    }
    if (/NEXT_PUBLIC_\w*(?:PRIVATE_KEY|MNEMONIC|SEED_PHRASE)/i.test(line)) {
      findings.add(`${location} [credential must not use a public frontend variable]`);
    }
    if (/-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/.test(line)) {
      findings.add(`${location} [private key material]`);
    }
  });
}

function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) scan(path.relative(root, absolute), fs.readFileSync(absolute));
  }
}

// Batch reads also handle tracked binary files without printing their contents.
function scanGitBlobs(entries) {
  if (!entries.length) return;
  const output = git(["cat-file", "--batch"], { input: entries.map(entry => entry.expression).join("\n") + "\n" });
  let offset = 0;
  for (const entry of entries) {
    const newline = output.indexOf(10, offset);
    const header = output.subarray(offset, newline).toString("utf8");
    if (!/^[\da-f]+ blob \d+$/.test(header)) throw new Error("Unable to inspect Git blob");
    const size = Number(header.split(" ")[2]);
    offset = newline + 1;
    scan(entry.label, output.subarray(offset, offset + size));
    offset += size + 1;
  }
}

try {
  if (process.argv.includes("--staged")) {
    const files = git(["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
    for (const file of files) {
      if (isPrivateEnv(file)) findings.add(`${file} [private environment file is tracked]`);
    }
    scanGitBlobs(files.map(file => ({ expression: `:${file}`, label: `index/${file}` })));
  } else {
    walk(root);
  }
  if (process.argv.includes("--history")) {
    const objects = git(["rev-list", "--objects", "--all"], { encoding: "utf8" }).trim().split("\n");
    const entries = [];
    for (const object of objects) {
      const match = object.match(/^([\da-f]+) (.+)$/);
      if (!match) continue;
      const [, oid, file] = match;
      if (isPrivateEnv(file)) findings.add(`history/${file} [private environment file exists in history]`);
      if (!file.includes("/node_modules/") && /(?:\.(?:ts|tsx|js|cjs|mjs|json|sol|md|py|sh|ps1|yml|yaml|xml|properties|example|pem|key)$|(?:^|\/)\.env[^/]*)/i.test(file)) {
        // rev-list includes directory objects too, so request only known source/config filenames.
        entries.push({ expression: oid, label: `history/${oid.slice(0, 8)}/${file}` });
      }
    }
    scanGitBlobs(entries);
  }
  if (findings.size) {
    console.error([...findings].join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${scanned} text files/blobs inspected; no matching credential material found.`);
  }
} catch {
  console.error("Secret check could not complete. Verify Git/file access; no secret values were printed.");
  process.exitCode = 1;
}
