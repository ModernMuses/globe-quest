#!/usr/bin/env python3
"""
Globe Quest — data generator.

Reads two open data sources and produces the two data files the game uses:

  data/countries.js  ->  window.COUNTRIES  (the editable list of countries)
  data/world.js      ->  window.WORLD_TOPO (the clickable world map, TopoJSON)

Sources (downloaded into /tmp by the setup step, or pass paths as args):
  - mledoze/countries   countries.json     (names, capitals, flags, languages…)
  - world-atlas         countries-110m.json (the map shapes)

You normally do NOT need to run this. To tweak the game, just edit
data/countries.js by hand — it is plain, readable JavaScript. Re-run this
only if you want to regenerate everything from the raw sources.

    python3 build/generate.py [mledoze.json] [countries-110m.json]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

mle_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/mledoze.json"
topo_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/countries-110m.json"

mle = json.load(open(mle_path))
topo = json.load(open(topo_path))

# Which numeric ISO codes actually have a shape on the map?
topo_ids = {str(g.get("id")) for g in topo["objects"]["countries"]["geometries"]}

def currency_strings(cur):
    out = []
    for code, info in (cur or {}).items():
        name = info.get("name", code)
        sym = info.get("symbol")
        out.append(f"{name} ({sym})" if sym else name)
    return out

countries = []
for c in mle:
    if not c.get("unMember"):
        continue
    ccn3 = c.get("ccn3")
    cap = c.get("capital") or []
    entry = {
        "name": c["name"]["common"],
        "official": c["name"]["official"],
        "iso2": c.get("cca2"),
        "iso3": c.get("cca3"),
        "ccn3": ccn3,
        "capital": cap[0] if cap else None,
        "region": c.get("region"),
        "subregion": c.get("subregion") or c.get("region"),
        "latlng": c.get("latlng"),
        "landlocked": bool(c.get("landlocked")),
        "area": c.get("area"),
        "languages": sorted(set((c.get("languages") or {}).values())),
        "currencies": currency_strings(c.get("currencies")),
        "neighbors": c.get("borders") or [],
        # True when the country has its own clickable shape on the map.
        # Tiny states without a shape are reachable via a map marker instead.
        "hasShape": ccn3 in topo_ids,
        # Curated "Did you know?" lines. Filled in by the enrichment step;
        # safe to add your own here at any time.
        "facts": [],
    }
    countries.append(entry)

countries.sort(key=lambda x: x["name"])

# ---- write data/countries.js (pretty, hand-editable) ----
banner = (
    "// Globe Quest — country data.\n"
    "// This file is the single source of truth for the game's content.\n"
    "// Everything here is safe to edit by hand: fix a capital, add a fact to\n"
    "// any country's \"facts\" list, change a name, etc. Save and reload.\n"
    "// (Re-running build/generate.py will overwrite this file.)\n\n"
    "window.COUNTRIES = "
)
with open(os.path.join(DATA, "countries.js"), "w") as f:
    f.write(banner)
    f.write(json.dumps(countries, ensure_ascii=False, indent=2))
    f.write(";\n")

# ---- write data/world.js (the map; not meant to be hand-edited) ----
with open(os.path.join(DATA, "world.js"), "w") as f:
    f.write("// Globe Quest — world map shapes (TopoJSON, world-atlas 110m).\n")
    f.write("// Generated; do not edit by hand.\n")
    f.write("window.WORLD_TOPO = ")
    json.dump(topo, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")

with_shape = sum(1 for c in countries if c["hasShape"])
print(f"Wrote {len(countries)} countries ({with_shape} with map shapes, "
      f"{len(countries) - with_shape} via markers).")
print("->", os.path.join(DATA, "countries.js"))
print("->", os.path.join(DATA, "world.js"))
