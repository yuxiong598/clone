"""Print locations, never contents. Deployment hashes are public and excluded."""
import os
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
excluded = {"node_modules", ".git", ".yarn", ".next", "artifacts", "cache", "deployments", "typechain-types"}
pattern = re.compile(r"(?<![0-9a-fA-F])(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])")
hits = []
for directory, folders, files in os.walk(root):
    folders[:] = [name for name in folders if name not in excluded]
    for name in files:
        path = Path(directory) / name
        # Private .env must also be scanned before submission.
        if path.suffix not in {".ts", ".tsx", ".js", ".cjs", ".json", ".md", ".properties", ".java", ".example"} and not name.startswith(".env"):
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if pattern.search(line):
                hits.append(f"{path.relative_to(root)}:{number}")
print("Potential key/hash locations (review manually):\n" + "\n".join(hits) if hits else "PASS: no 64-hex literals in scanned source/config/docs.")
sys.exit(bool(hits))
