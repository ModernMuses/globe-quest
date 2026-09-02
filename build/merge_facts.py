#!/usr/bin/env python3
"""Merge verified "Did you know?" facts into data/countries.js.

Reads a workflow result JSON ({"result":{"facts":[{name,fact}]}} or
{"facts":[...]}) and writes each fact onto the matching country's `facts`
list. Matching is accent-insensitive with a small alias table; anything that
does not match is printed so it can be handled.
"""
import json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CJS = os.path.join(ROOT, "data", "countries.js")

out_path = sys.argv[1]
raw = json.load(open(out_path))
facts = (raw.get("result") or raw).get("facts", [])

# load countries.js array
src = open(CJS).read()
arr = json.loads(src[src.index("["):src.rindex("]") + 1])

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().strip()
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[^a-z0-9 ]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s

ALIASES = {
    "cabo verde": "Cape Verde",
    "cote divoire": "Ivory Coast",
    "east timor": "Timor-Leste",
    "timorleste": "Timor-Leste",
    "democratic republic of the congo": "DR Congo",
    "dr congo": "DR Congo",
    "drc": "DR Congo",
    "congo": "Republic of the Congo",
    "republic of congo": "Republic of the Congo",
    "burma": "Myanmar",
    "turkey": "Türkiye",
    "swaziland": "Eswatini",
    "vatican": "Vatican City",
    "holy see": "Vatican City",
    "micronesia federated states of": "Micronesia",
    "federated states of micronesia": "Micronesia",
    "the gambia": "Gambia",
    "united states of america": "United States",
}

by_norm = {}
for c in arr:
    by_norm[norm(c["name"])] = c
    if c.get("official"):
        by_norm.setdefault(norm(c["official"]), c)
for k, v in ALIASES.items():
    if norm(v) in by_norm:
        by_norm[k] = by_norm[norm(v)]

matched, unmatched = 0, []
for f in facts:
    n = norm(f["name"])
    c = by_norm.get(n)
    if not c:
        unmatched.append(f["name"]); continue
    fact = f["fact"].strip()
    if fact not in c["facts"]:
        c["facts"].append(fact)
    matched += 1

# Hand-written backfill for any country a subregion agent skipped.
SUPPLEMENT = {
    "Slovenia": "Slovenia is one of Europe's greenest countries, with forest covering around 60 percent of its land.",
}
for name, fact in SUPPLEMENT.items():
    c = by_norm.get(norm(name))
    if c and not c["facts"]:
        c["facts"].append(fact)

with_fact = sum(1 for c in arr if c["facts"])
banner = (
    "// Globe Quest — country data.\n"
    "// This file is the single source of truth for the game's content.\n"
    "// Everything here is safe to edit by hand: fix a capital, add a fact to\n"
    "// any country's \"facts\" list, change a name, etc. Save and reload.\n"
    "// (Re-running build/generate.py will overwrite this file.)\n\n"
    "window.COUNTRIES = "
)
open(CJS, "w").write(banner + json.dumps(arr, ensure_ascii=False, indent=2) + ";\n")

print(f"Matched {matched} facts; {with_fact}/{len(arr)} countries now have a fact.")
if unmatched:
    print("UNMATCHED names (%d):" % len(unmatched))
    for u in unmatched:
        print("  -", u)
missing = [c["name"] for c in arr if not c["facts"]]
if missing:
    print("Countries with NO fact yet (%d):" % len(missing))
    print("  " + ", ".join(missing))
