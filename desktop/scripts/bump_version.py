"""Set the app version everywhere it lives:  python desktop/scripts/bump_version.py 0.1.2"""
import json, re, sys
from pathlib import Path

if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+(-[\w.]+)?", sys.argv[1]):
    sys.exit("usage: bump_version.py MAJOR.MINOR.PATCH   (e.g. 0.1.2)")
v = sys.argv[1]
d = Path(__file__).resolve().parents[1]

conf = d / "src-tauri" / "tauri.conf.json"
c = json.loads(conf.read_text(encoding="utf-8")); c["version"] = v
conf.write_text(json.dumps(c, indent=2) + "\n", encoding="utf-8")

pkg = d / "package.json"
p = json.loads(pkg.read_text(encoding="utf-8")); p["version"] = v
pkg.write_text(json.dumps(p, indent=2) + "\n", encoding="utf-8")

cargo = d / "src-tauri" / "Cargo.toml"
t = cargo.read_text(encoding="utf-8")
t, n = re.subn(r'(?m)^version = "[^"]*"', f'version = "{v}"', t, count=1)
assert n == 1, "version line not found in Cargo.toml"
cargo.write_text(t, encoding="utf-8")
print(f"Version set to {v} in tauri.conf.json, package.json and Cargo.toml")
