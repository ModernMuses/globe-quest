/* Globe Quest — interactive world map.
 *
 * A small wrapper around d3-geo that:
 *   - draws every country shape from the bundled TopoJSON
 *   - adds a clickable marker for tiny countries that have no shape at 110m
 *   - supports hover, click-to-pick, highlight, zoom-to-country / continent
 *
 * It knows nothing about the quiz rules — it just reports which country was
 * clicked (onPick) and exposes methods the game calls (highlight, flash…).
 */
(function () {
  'use strict';

  // ---- shared geo prep (done once) ----
  const TOPO = window.WORLD_TOPO;
  const FEATURES = topojson.feature(TOPO, TOPO.objects.countries).features;

  // ccn3 (numeric ISO, e.g. "250") -> our country record
  const BY_CCN3 = {};
  window.COUNTRIES.forEach((c) => { BY_CCN3[c.ccn3] = c; });

  // Country palette indices — the 8-colour set MINUS 5 (the blue #97b6ec). Blue is reserved for
  // hover/selection, so no country/territory/marker is ever coloured blue (avoids "looks selected"
  // + a blue country reading as a clue). See .country.cN / .marker.cN in styles.css.
  const PALETTE = [0, 1, 2, 3, 4, 6, 7];

  // Attach our country record (if any) + a display name to each shape.
  // _key is a UNIQUE, stable data-join key: disputed territories (Somaliland,
  // Kosovo, …) have no `id`, so keying by `id` collided them all on `undefined`
  // and stacked duplicate paths on every re-render. Index makes each unique.
  FEATURES.forEach((f, i) => {
    f.country = BY_CCN3[String(f.id).padStart(3, '0')] || BY_CCN3[String(f.id)] || null;
    f.displayName = (f.country && f.country.name) || (f.properties && f.properties.name) || 'Unknown';
    f._key = (f.id != null && f.id !== '') ? String(f.id) : 'noid-' + i;
    // Disputed territories (W. Sahara, Somaliland, Kosovo, …) have no country record,
    // so give them a stable palette colour too — otherwise they render plain grey and
    // look out of place next to the colourful countries.
    if (!f.country) {
      let h = 0;
      for (let j = 0; j < f._key.length; j++) h = (h * 31 + f._key.charCodeAt(j)) >>> 0;
      f._tcolor = PALETTE[h % PALETTE.length];
    }
  });

  // Countries that have NO shape on the map (microstates) -> markers.
  const MARKER_COUNTRIES = window.COUNTRIES.filter((c) => !c.hasShape && c.latlng);

  // Give each country a palette colour (from PALETTE — no blue) so the map looks like a political
  // atlas; greedy graph colouring over shared borders => neighbours never match. randomize=true
  // shuffles the order AND picks a random available colour, so the SAME country gets a DIFFERENT
  // colour each time — colour can't be memorised as a clue in the Find-on-Map games.
  function assignCountryColors(randomize) {
    // ALWAYS colour highest-degree countries first — that order keeps the greedy colouring
    // conflict-free (a shuffled order can leave a 14-neighbour country like China with no colour
    // left). randomize only changes WHICH available colour each country picks, so it still varies.
    const order = window.COUNTRIES.slice().sort((a, b) =>
      ((b.neighbors ? b.neighbors.length : 0) - (a.neighbors ? a.neighbors.length : 0)) ||
      (a.iso3 < b.iso3 ? -1 : 1));
    const colorOf = {};
    order.forEach((c) => {
      const used = new Set();
      (c.neighbors || []).forEach((n) => { if (colorOf[n] != null) used.add(colorOf[n]); });
      const avail = PALETTE.filter((k) => !used.has(k));
      const pool = avail.length ? avail : PALETTE;
      colorOf[c.iso3] = randomize ? pool[Math.floor(Math.random() * pool.length)] : pool[0];
    });
    window.COUNTRIES.forEach((c) => { c._color = colorOf[c.iso3]; });
  }
  assignCountryColors(false); // initial stable colouring at load
  window.__gqRecolor = () => assignCountryColors(true); // app.js reshuffles colours per Find round

  // ---- geometry helpers (projected screen coords) ----
  function rayInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function ringArea(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]);
    return a / 2;
  }
  function distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
  function distToRing(x, y, ring) {
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) best = Math.min(best, distSeg(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1]));
    return best;
  }
  // One-time land/ocean raster: an O(1) "is this lon/lat over open water?" test, built
  // from the SAME merged land that is painted — so a leader label cleared as "ocean" can
  // never sit on any painted country or territory.
  let _OCEAN_TEST = null;
  function ensureOceanMask() {
    if (_OCEAN_TEST) return _OCEAN_TEST;
    const land = topojson.merge(TOPO, TOPO.objects.countries.geometries);
    const MW = 1024, MH = 512;
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const ctx = cv.getContext('2d');
    const mp = d3.geoNaturalEarth1().fitExtent([[0, 0], [MW, MH]], { type: 'FeatureCollection', features: FEATURES });
    const gp = d3.geoPath(mp, ctx);
    ctx.fillStyle = '#000'; ctx.beginPath(); gp(land); ctx.fill();
    let img = null;
    try { img = ctx.getImageData(0, 0, MW, MH).data; } catch (_) { img = null; }
    _OCEAN_TEST = (lon, lat) => {
      if (!img) return true;
      const p = mp([lon, lat]); if (!p || !isFinite(p[0])) return false;
      const x = p[0] | 0, y = p[1] | 0;
      if (x < 0 || y < 0 || x >= MW || y >= MH) return true;
      return img[(y * MW + x) * 4 + 3] === 0;
    };
    return _OCEAN_TEST;
  }

  class GlobeMap {
    constructor(svgEl, opts) {
      this.opts = Object.assign({ onPick: null, showLabels: false }, opts || {});
      this.svg = d3.select(svgEl);
      this.el = svgEl;
      this.interactive = false;
      this.k = 1; // current zoom scale
      this._selIso = null; // the selected/highlighted country: its name is always shown

      this.projection = d3.geoNaturalEarth1();
      this.path = d3.geoPath(this.projection);

      // layers — everything lives inside the zoom group so the ocean, land,
      // markers and labels all pan and scale together when zooming.
      this.g = this.svg.append('g').attr('class', 'zoom-layer');
      this.gOcean = this.g.append('path').attr('class', 'ocean').datum({ type: 'Sphere' });
      // Clicking open water reports a lat/lon (used by Find-the-ocean/sea/lake/river).
      this.gOcean.on('click', (e) => {
        if (!this.interactive || !this.opts.onPick) return;
        const m = d3.pointer(e, this.g.node());
        const ll = this.projection.invert && this.projection.invert(m);
        if (ll && isFinite(ll[0]) && isFinite(ll[1])) this.opts.onPick({ isPoint: true, lat: ll[1], lon: ll[0] });
      });
      this.gLand = this.g.append('g').attr('class', 'land-layer');
      this.gWaterArea = this.g.append('g').attr('class', 'water-area-layer'); // ocean/sea/river highlight
      this.gWaterHit = this.g.append('g').attr('class', 'water-hit-layer'); // transparent hit-regions: hover/click the AREA of an ocean/river/lake
      this.gMarks = this.g.append('g').attr('class', 'marker-layer');
      this.gLabels = this.g.append('g').attr('class', 'label-layer');
      this.gPlaces = this.g.append('g').attr('class', 'place-layer'); // continent/water labels
      this.gTags = this.g.append('g').attr('class', 'tag-layer'); // answer name tags (top-most)
      this._ovTags = []; this._ovAsk = null; // overlay state, redrawn from _render()

      // zoom behaviour
      this.zoom = d3.zoom()
        .scaleExtent([1, 14])
        .clickDistance(8) // a tap that drifts up to 8px still counts as a click, not a pan — so clicking a big territory reliably selects it
        .on('zoom', (event) => {
          this.k = event.transform.k;
          this.g.attr('transform', event.transform);
          this.gMarks.selectAll('circle').attr('r', (d) => (d._r || 5) / this.k);
          this._applyLabelVisibility();
          this.gTags.selectAll('g.atag')
            .attr('transform', (d) => `translate(${d.x},${d.y}) scale(${this._labelScale()})`);
          this.gPlaces.selectAll('g.place')
            .attr('transform', (d) => `translate(${d.x},${d.y}) scale(${this._labelScale()})`);
          // NOTE: we do NOT re-place labels on zoom — they glide with the map so names
          // never jump. Placement only re-runs on resize / when labels are toggled on.
        });
      this.svg.call(this.zoom).on('dblclick.zoom', null);

      this._render();
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') (window.__maps = window.__maps || []).push(this);

      // keep the map fitted to its container
      if (typeof ResizeObserver !== 'undefined') {
        // Debounced so a window-drag / mobile URL-bar resize storm collapses to one
        // recompute (label placement is the expensive part of a re-render).
        this._ro = new ResizeObserver(() => { clearTimeout(this._roT); this._roT = setTimeout(() => this.resize(), 110); });
        this._ro.observe(svgEl.parentElement || svgEl);
      }
      // Re-fit once layout has settled, in case the first measurement happened
      // before the SVG reached its final size.
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => this.resize());
    }

    _size() {
      const r = this.el.getBoundingClientRect();
      return [Math.max(r.width, 10), Math.max(r.height, 10)];
    }

    _fit(fc, pad) {
      const [w, h] = this._size();
      this.svg.attr('viewBox', `0 0 ${w} ${h}`);
      this.projection.fitExtent([[pad, pad], [w - pad, h - pad]], fc);
    }

    _render() {
      this._fit({ type: 'FeatureCollection', features: FEATURES }, 8);

      // ocean / globe silhouette
      this.gOcean.attr('d', this.path);

      // country shapes (keyed by the unique _key; exit() clears any orphans)
      const paths = this.gLand.selectAll('path').data(FEATURES, (f) => f._key);
      paths.exit().remove();
      paths.enter()
        .append('path')
        .attr('class', (f) => 'country' + (f.country ? ' c' + f.country._color : ' is-territory c' + f._tcolor))
        .on('mouseenter', (e, f) => this._hover(e.currentTarget, f, true))
        .on('mouseleave', (e, f) => this._hover(e.currentTarget, f, false))
        .on('click', (e, f) => this._click(e, f))
        .merge(paths)
        .attr('d', this.path);

      // markers for shapeless microstates
      const marks = this.gMarks.selectAll('circle').data(MARKER_COUNTRIES, (c) => c.iso3);
      marks.enter()
        .append('circle')
        .attr('class', (c) => 'marker c' + c._color + (c.territory ? ' territory-marker' : ''))
        .each(function (c) { c._r = 5; })
        .attr('r', 5)
        .on('mouseenter', (e, c) => this._hoverMarker(e.currentTarget, c, true))
        .on('mouseleave', (e, c) => this._hoverMarker(e.currentTarget, c, false))
        .on('click', (e, c) => this._clickMarker(c))
        .merge(marks)
        .attr('cx', (c) => this.projection([c.latlng[1], c.latlng[0]])[0])
        .attr('cy', (c) => this.projection([c.latlng[1], c.latlng[0]])[1])
        .attr('r', (c) => 5 / this.k);

      if (this.labelsOn) this._renderLabels();
      if (this._ovTags && (this._ovTags.length || this._ovAsk)) this._drawOverlay();
    }

    // ---- name labels (used by Preview mode) ----
    setLabels(on) {
      this.labelsOn = !!on;
      if (on) this._renderLabels();
      else this.gLabels.selectAll('*').remove();
      return this;
    }

    // Recolour the land. fn(feature) -> class string; pass null to restore the political map.
    setLandColoring(fn) {
      this.gLand.selectAll('path').attr('class', fn || ((f) => 'country' + (f.country ? ' c' + f.country._color : ' is-territory c' + f._tcolor)));
      return this;
    }
    // Hide the thin country borders (used by the continents view → solid continent blobs).
    setBordersHidden(on) { this.el.classList.toggle('borders-hidden', !!on); return this; }
    // Show EVERY country name at once (no progressive reveal) — used by the Countries atlas.
    setShowAllLabels(on) { this.labelsShowAll = !!on; this._applyLabelVisibility(); return this; }
    // Hide the microstate dots (continents / water views don't want them).
    setMarkersHidden(on) { if (this.gMarks) this.gMarks.attr('display', on ? 'none' : null); return this; }
    // Draw the soft fill of a named ocean/sea/river (from window.WATER_GEO). `cls` picks the
    // state look: 'water-hover' (lighter) on hover, 'water-sel' (darker) when selected. The two
    // states use SEPARATE paths (keyed by class) so hovering one water never wipes the selected
    // one's highlight — the selection stays lit while a hover shows on top.
    // A water so large it would wash the whole map (the globe-spanning oceans, or a mis-wound ring
    // that d3 renders as the world-minus-shape). Such waters are shown by NAME/tag, never a fill.
    _waterTooBig(geo) {
      try {
        const b = this.path.bounds({ type: 'Feature', geometry: geo });
        const [w, h] = this._size();
        return (b[1][0] - b[0][0]) > w * 0.5 || (b[1][1] - b[0][1]) > h * 0.62;
      } catch (e) { return false; }
    }
    // Map a water's NAME to its semantic type (river/lake/ocean/sea/gulf), cached from window.WATERS,
    // so its path can be coloured by kind (lakes teal, rivers blue).
    _waterTypeOf(name) {
      if (!this._wtype) {
        this._wtype = {};
        (window.WATERS || []).forEach((w) => { this._wtype[w.name] = w.type; });
      }
      return this._wtype[name] || '';
    }
    _wtClass(name, type) {
      const t = type || this._waterTypeOf(name);
      return t ? ' wt-' + t : '';
    }
    showWaterArea(name, cls) {
      if (!this.gWaterArea) return this;
      cls = cls || 'water-sel';
      const geo = (window.WATER_GEO || {})[name];
      if (!geo) { this.gWaterArea.selectAll('path.' + cls).remove(); return this; }
      const isLine = geo.type === 'LineString' || geo.type === 'MultiLineString';
      // Globe-spanning oceans still highlight, but VERY faintly (water-vast) so they don't wash the
      // whole map — a gentle hover cue instead of the opaque blob.
      const vast = !isLine && this._waterTooBig(geo);
      let p = this.gWaterArea.select('path.' + cls);
      if (p.empty()) p = this.gWaterArea.append('path');
      p.attr('class', 'water-area ' + cls + (isLine ? ' water-line' : '') + (vast ? ' water-vast' : '') + this._wtClass(name));
      p.attr('d', this.path({ type: 'Feature', geometry: geo }));
      return this;
    }
    // clearWaterArea() wipes everything; clearWaterArea('water-hover') removes just that state's path.
    clearWaterArea(cls) {
      if (this.gWaterArea) this.gWaterArea.selectAll(cls ? 'path.' + cls : '*').remove();
      return this;
    }
    // Transparent interactive hit-regions over each ocean/river/lake AREA, so hovering or
    // clicking the territory behaves exactly like hovering/clicking its name pill.
    showWaterShapes(items, onTap, onHover) {
      if (!this.gWaterHit) return this;
      const data = (items || []).map((w) => {
        const geo = (window.WATER_GEO || {})[w.name];
        return geo ? Object.assign({}, w, { _geo: geo }) : null;
      }).filter(Boolean);
      const sel = this.gWaterHit.selectAll('path.water-hit').data(data, (d) => d.name);
      sel.exit().remove();
      const enter = sel.enter().append('path')
        .on('click', (e, d) => { if (onTap) onTap(d); })
        .on('mouseenter', (e, d) => { if (onHover) onHover(d, true); })
        .on('mouseleave', (e, d) => { if (onHover) onHover(d, false); });
      enter.merge(sel)
        .attr('class', (d) => 'water-hit' + ((d._geo.type === 'LineString' || d._geo.type === 'MultiLineString') ? ' water-hit-line' : ''))
        .attr('d', (d) => this.path({ type: 'Feature', geometry: d._geo }));
      return this;
    }
    clearWaterShapes() { if (this.gWaterHit) this.gWaterHit.selectAll('*').remove(); return this; }
    // Faint, always-on outlines of every water in a set, so you can SEE where to hover/click
    // (rivers are thin and otherwise invisible). Non-interactive; drawn UNDER the hover/select fills.
    showWaterRest(items) {
      if (!this.gWaterArea) return this;
      this.gWaterArea.selectAll('path.water-rest').remove();
      (items || []).forEach((w) => {
        const geo = (window.WATER_GEO || {})[w.name];
        if (!geo) return;
        const isLine = geo.type === 'LineString' || geo.type === 'MultiLineString';
        this.gWaterArea.insert('path', ':first-child') // keep rest beneath the hover/selected fills
          .attr('class', 'water-rest' + (isLine ? ' water-line' : '') + this._wtClass(w.name, w.type))
          .attr('d', this.path({ type: 'Feature', geometry: geo }));
      });
      return this;
    }
    // Quiz reveal: outline one or more named waters with a state class ('correct'|'wrong'),
    // softer than the country flash. items = [{name, kind}]. Waters with no geometry are skipped.
    showWaterStates(items) {
      if (!this.gWaterArea) return this;
      this.gWaterArea.selectAll('*').remove();
      (items || []).forEach((it) => {
        const geo = (window.WATER_GEO || {})[it.name];
        if (!geo) return;
        const isLine = geo.type === 'LineString' || geo.type === 'MultiLineString';
        const vast = !isLine && this._waterTooBig(geo); // globe-spanning ocean → faint wash, not an opaque blob
        this.gWaterArea.append('path')
          .attr('class', 'water-area water-' + (it.kind || 'correct') + (isLine ? ' water-line' : '') + (vast ? ' water-vast' : '') + this._wtClass(it.name))
          .attr('d', this.path({ type: 'Feature', geometry: geo }));
      });
      return this;
    }
    // Country-hover behaviour: 'country' = normal per-country hover; 'off' = none (the app
    // wires its own hover for continents/waters so the WHOLE continent / a water lights up).
    setHoverMode(mode) { this.hoverMode = mode || 'country'; return this; }

    // Label group scale. On-screen size ≈ k^0.25 (capped), so labels stay roughly
    // constant but grow gently as you zoom in. /k cancels the parent zoom transform.
    // Used by the continent / water / answer-tag pills.
    _labelScale() {
      const k = this.k || 1;
      return Math.min(Math.pow(k, 0.25), 2) / k;
    }

    // On-screen size multiplier for COUNTRY labels specifically: deliberately SMALL when
    // zoomed out (so many names fit inside their countries — a properly labelled world map)
    // and growing to a comfortable size as you zoom in. /k (in _clabelScale) cancels zoom.
    _clabelMul(k) { return Math.min(Math.max(0.58, 0.58 * Math.pow(k, 0.42)), 1.85); }
    _clabelScale() { const k = this.k || 1; return this._clabelMul(k) / k; }

    _renderLabels() {
      // One label per country (the largest piece of a multi-part country), plus one for
      // each shapeless microstate marker.
      const byIso = {};
      FEATURES.forEach((f) => {
        if (!f.country) return;
        const c = this.path.centroid(f);
        if (!(isFinite(c[0]) && isFinite(c[1]))) return;
        const a = Math.abs(d3.geoArea(f));
        const cur = byIso[f.country.iso3];
        if (!cur || a > cur._a) byIso[f.country.iso3] = { name: f.country.name, x: c[0], y: c[1], iso3: f.country.iso3, country: f.country, feature: f, _a: a };
      });
      const items = Object.keys(byIso).map((k) => byIso[k]);
      MARKER_COUNTRIES.forEach((c) => {
        const p = this.projection([c.latlng[1], c.latlng[0]]);
        if (p && isFinite(p[0])) items.push({ name: c.name, x: p[0], y: p[1], iso3: c.iso3, country: c, marker: true });
      });

      const groups = this.gLabels.selectAll('g.clabel').data(items, (d) => d.iso3 || d.name);
      groups.exit().remove();
      const enter = groups.enter().append('g').attr('class', 'clabel');
      enter.append('path').attr('class', 'clabel-leader');
      enter.append('circle').attr('class', 'clabel-ring').attr('cx', 0).attr('cy', 0).attr('r', 2.6);
      enter.append('rect').attr('class', 'clabel-bg');
      enter.append('text').attr('text-anchor', 'middle').attr('dy', '0.32em');
      // Hovering a name does the exact same thing as hovering the country shape.
      enter
        .on('mouseenter', (e, d) => this._richHover(d.iso3, d.country, true))
        .on('mouseleave', (e, d) => this._richHover(d.iso3, d.country, false))
        .on('click', (e, d) => { if (this.opts.onPick && d.country) this.opts.onPick({ iso3: d.iso3, country: d.country, name: d.name, isCountry: true }); });
      enter.merge(groups).select('text').text((d) => d.name);

      this._precomputeLabels();
      this._applyLabelVisibility();
    }

    // ===== cartographic label placement =====
    // Every label is anchored at a FIXED geographic point — an interior "pole" for inside
    // labels, an over-water point for leader labels — so it glides with the map and never
    // jumps. A per-label reveal zoom (kShow) lets the per-zoom pass decide visibility with
    // a single comparison: a name only appears once it provably fits INSIDE its own country
    // (never covering a neighbour) or sits on open water with a leader line.
    _precomputeLabels() {
      if (!this.gLabels) return;
      const ocean = ensureOceanMask();
      const padX = 7, padY = 4, margin = 0.9;
      const AREA_INSIDE = 400000; // only sizeable countries (km²) get an INSIDE label; smaller → water leader
      const S = (k) => this._clabelMul(k); // on-screen size multiplier; matches the render
      const nodes = this.gLabels.selectAll('g.clabel').nodes();

      // 1) measure each name once (padded box at scale 1)
      nodes.forEach((n) => {
        const d = n.__data__, t = n.querySelector('text');
        t.setAttribute('x', 0); t.setAttribute('y', 0);
        let tb; try { tb = t.getBBox(); } catch (_) { tb = { width: 0, height: 0 }; }
        d.tw0 = tb.width + 2 * padX; d.th0 = tb.height + 2 * padY;
        d.kCollide = 1;
      });

      // project every country's polygon ONCE (reused below + for the never-covers test that
      // checks a spilling label against its neighbours' actual shapes, not the coarse mask).
      const polyIndex = [];
      nodes.forEach((n) => {
        const d = n.__data__;
        if (!d.feature) return;
        const polys = this._projPolys(d.feature);
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
        polys.forEach((poly) => poly[0].forEach((p) => { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }));
        d._polys = polys;
        polyIndex.push({ iso3: d.iso3, polys, minx, miny, maxx, maxy });
      });
      // microstate markers (no polygon) — a spilling pill must not land on these either
      const markerPts = MARKER_COUNTRIES.map((c) => { const p = this.projection([c.latlng[1], c.latlng[0]]); return (p && isFinite(p[0])) ? { iso: c.iso3, x: p[0], y: p[1] } : null; }).filter(Boolean);
      this._buildSpatial(polyIndex); // bucket countries by screen cell so the never-covers test is O(few), not O(165)

      // 2) placement tiers. First settle the INSIDE labels; everything left over (small,
      // island, marker) is routed to an over-water leader — de-conflicting the leaders so
      // a crowded coast (North Sea, Adriatic, Gulf) spreads its pills instead of stacking
      // them all on one patch of sea (which would defer them to max zoom).
      const leftover = [];
      nodes.forEach((n) => {
        const d = n.__data__;
        if (d.feature) {
          const polys = d._polys || this._projPolys(d.feature);
          const ip = this._interiorPoint(polys);
          if (ip && ip.score > 1.4) {
            d.x = ip.x; d.y = ip.y;
            const kFit = this._verifyFit(d, ip, polyIndex, markerPts, S);
            // Only sizeable countries get an INSIDE label (and only if the name actually fits
            // by max zoom); smaller ones go out to the water with a leader (Hybrid) so they
            // don't cover the land. Area is viewport-independent, so the split is consistent.
            if (kFit <= 14 && d.country && d.country.area >= AREA_INSIDE) { d.tier = 'inside'; d.kReveal = kFit; d.leadFromX = d.x; d.leadFromY = d.y; return; }
            d._ox = ip.x; d._oy = ip.y;
          } else { d._ox = d.x; d._oy = d.y; }
        } else { d._ox = d.x; d._oy = d.y; }
        leftover.push(d);
      });
      leftover.sort((a, b) => (((b.country && b.country.area) || 0) - ((a.country && a.country.area) || 0)));
      const placedLeaders = [];
      leftover.forEach((d) => this._toLeader(d, d._ox, d._oy, ocean, S, placedLeaders, polyIndex, markerPts));

      // 3) order by area (biggest first) for the collision sweep below. We deliberately do
      // NOT floor the reveal zoom by rank — a name appears as soon as it geometrically fits
      // inside its country, so the map looks properly labelled rather than nearly empty.
      const order = nodes.slice().sort((a, b) =>
        (((b.__data__.country && b.__data__.country.area) || 0) - ((a.__data__.country && a.__data__.country.area) || 0)));

      // 4) collision sweep (closed form): a smaller label yields until it clears every
      // bigger accepted one. Two fixed anchors separate on screen ~k while pills grow
      // ~k^0.25, so the clearing zoom is analytic — no per-zoom layout needed.
      const accepted = [];
      order.forEach((n) => {
        const B = n.__data__;
        if (B.tier === 'hide') return;
        accepted.forEach((A) => {
          const dx = Math.abs(A.x - B.x), dy = Math.abs(A.y - B.y);
          const kX = dx > 0 ? Math.pow((A.tw0 + B.tw0) * 0.5 / dx, 4 / 3) : Infinity;
          const kY = dy > 0 ? Math.pow((A.th0 + B.th0) * 0.5 / dy, 4 / 3) : Infinity;
          B.kCollide = Math.max(B.kCollide, Math.min(Math.min(kX, kY), 14.001));
        });
        accepted.push(B);
      });

      // 5) final reveal zoom + static box / leader geometry
      nodes.forEach((n) => {
        const d = n.__data__;
        // Cap at the max zoom so EVERY country is visible by the time you fully zoom in —
        // nothing is permanently hidden (Olga: "I need to see all").
        d.kShow = Math.min(14, Math.max(d.kReveal || 1, d.kCollide || 1));
        const rect = n.querySelector('rect'), text = n.querySelector('text');
        text.setAttribute('x', 0); text.setAttribute('y', 0);
        let bb; try { bb = text.getBBox(); } catch (_) { bb = { x: -d.tw0 / 2, y: -d.th0 / 2, width: d.tw0 - 2 * padX, height: d.th0 - 2 * padY }; }
        rect.setAttribute('x', bb.x - padX); rect.setAttribute('y', bb.y - padY);
        rect.setAttribute('width', bb.width + 2 * padX); rect.setAttribute('height', bb.height + 2 * padY);
        rect.setAttribute('rx', 5);
      });
    }

    // Projected rings of a feature: [ [outer, hole, …], … ] in current screen coords.
    _projPolys(f) {
      const proj = this.projection, g = f.geometry, out = [];
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach((rings) => {
        const pr = [];
        rings.forEach((ring) => {
          const r = [];
          for (let i = 0; i < ring.length; i++) { const p = proj(ring[i]); if (p && isFinite(p[0]) && isFinite(p[1])) r.push(p); }
          if (r.length >= 3) pr.push(r);
        });
        if (pr.length) out.push(pr);
      });
      return out;
    }

    _pointInPolys(x, y, polys) {
      for (let i = 0; i < polys.length; i++) {
        const poly = polys[i];
        if (rayInRing(x, y, poly[0])) {
          let inHole = false;
          for (let h = 1; h < poly.length; h++) { if (rayInRing(x, y, poly[h])) { inHole = true; break; } }
          if (!inHole) return true;
        }
      }
      return false;
    }

    // Pole of inaccessibility (the interior point furthest from any edge) of the largest
    // ring, plus the inscribed half-width/height there — all in projected screen coords.
    _interiorPoint(polys) {
      let best = null, bestA = -1;
      polys.forEach((p) => { const a = Math.abs(ringArea(p[0])); if (a > bestA) { bestA = a; best = p; } });
      if (!best) return null;
      const outer = best[0], holes = best.slice(1);
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      outer.forEach((p) => { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; });
      const inside = (x, y) => { if (!rayInRing(x, y, outer)) return false; for (let h = 0; h < holes.length; h++) if (rayInRing(x, y, holes[h])) return false; return true; };
      const clr = (x, y) => { let d = distToRing(x, y, outer); for (let h = 0; h < holes.length; h++) d = Math.min(d, distToRing(x, y, holes[h])); return d; };
      let bx = (minx + maxx) / 2, by = (miny + maxy) / 2, bs = -1;
      const G = 8;
      for (let gx = 1; gx < G; gx++) for (let gy = 1; gy < G; gy++) {
        const x = minx + (maxx - minx) * gx / G, y = miny + (maxy - miny) * gy / G;
        if (inside(x, y)) { const s = clr(x, y); if (s > bs) { bs = s; bx = x; by = y; } }
      }
      if (bs < 0) return null;
      let step = Math.max(maxx - minx, maxy - miny) / G / 2;
      for (let it = 0; it < 5; it++) {
        const cand = [[bx + step, by], [bx - step, by], [bx, by + step], [bx, by - step], [bx + step, by + step], [bx - step, by - step]];
        cand.forEach((c) => { if (inside(c[0], c[1])) { const s = clr(c[0], c[1]); if (s > bs) { bs = s; bx = c[0]; by = c[1]; } } });
        step /= 2;
      }
      const march = (dx, dy) => {
        let lo = 0, hi = Math.max(bs, 1);
        while (hi < 4000 && inside(bx + dx * hi, by + dy * hi)) { lo = hi; hi *= 2; }
        for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (inside(bx + dx * mid, by + dy * mid)) lo = mid; else hi = mid; }
        return lo;
      };
      const clearX = Math.min(march(1, 0), march(-1, 0));
      const clearY = Math.min(march(0, 1), march(0, -1));
      return { x: bx, y: by, clearX, clearY, score: bs };
    }

    // Smallest zoom k (≤14) at which the centred name is CLEAN: its anchor is on this
    // country, it fits the country's height (so it reads as a country label, not a sea
    // label), and every sampled point of the pill is on THIS country OR on open water —
    // never on another country. Spilling into the adjacent sea is allowed (most coastal
    // countries can show their name far sooner this way); covering a neighbour is not.
    // This IS the never-covers guarantee.
    _verifyFit(d, ip, polyIndex, markerPts, S) {
      if (!this._pointInPolys(d.x, d.y, d._polys)) return 99;
      const margin = 0.9;
      const kLadder = [1, 1.3, 1.7, 2.2, 3, 4, 5.5, 7.5, 10, 14];
      for (let ki = 0; ki < kLadder.length; ki++) {
        const k = kLadder[ki], s = S(k);
        const hw = d.tw0 * s / (2 * k) * 1.08, hh = d.th0 * s / (2 * k) * 1.08; // small safety margin
        if (hh > margin * ip.clearY * k) continue; // text taller than the country here → not yet
        if (this._pillClear(d.x, d.y, hw, hh, d._polys, d.iso3, polyIndex, markerPts)) return k;
      }
      return 99;
    }

    // True iff the pill rect [cx±hw, cy±hh] touches NO other country: no microstate marker
    // inside it, no sampled point on another country's land, and no neighbour's vertex poking
    // into it (which catches thin slivers and a long name spanning a sea onto a far coast).
    _pillClear(cx, cy, hw, hh, polys, ownIso, polyIndex, markerPts) {
      const l = cx - hw, r = cx + hw, t = cy - hh, b = cy + hh;
      for (let i = 0; i < markerPts.length; i++) { const mp = markerPts[i]; if (mp.iso !== ownIso && mp.x >= l && mp.x <= r && mp.y >= t && mp.y <= b) return false; }
      const gx = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1], gy = [-1, -0.5, 0, 0.5, 1];
      let spilled = false;
      for (let ix = 0; ix < gx.length; ix++) {
        for (let iy = 0; iy < gy.length; iy++) {
          const x = cx + gx[ix] * hw, y = cy + gy[iy] * hh;
          if (polys.length && this._pointInPolys(x, y, polys)) continue; // own land — fine
          spilled = true;
          if (this._otherLand(x, y, ownIso)) return false;               // on a neighbour — no
        }
      }
      // Only a pill that spills off its own land can reach a far coast / sliver between the
      // sample points, so the (costlier) vertex check is needed only then.
      if (spilled) {
        for (let i = 0; i < polyIndex.length; i++) {
          const e = polyIndex[i];
          if (e.iso3 === ownIso || e.maxx < l || e.minx > r || e.maxy < t || e.miny > b) continue;
          for (let pi = 0; pi < e.polys.length; pi++) {
            const ring = e.polys[pi][0]; // step 2: a pill spans many vertices, so every 2nd suffices
            for (let vi = 0; vi < ring.length; vi += 2) { const vx = ring[vi][0], vy = ring[vi][1]; if (vx >= l && vx <= r && vy >= t && vy <= b) return false; }
          }
        }
      }
      return true;
    }

    // Bucket every country into a coarse screen grid so point/pill tests only consider the
    // handful of countries near them, not all 165.
    _buildSpatial(polyIndex) {
      const [vw, vh] = this._size(), G = 18;
      const cells = new Array(G * G).fill(null);
      const cx = (x) => Math.max(0, Math.min(G - 1, Math.floor(x / vw * G)));
      const cy = (y) => Math.max(0, Math.min(G - 1, Math.floor(y / vh * G)));
      polyIndex.forEach((e) => {
        for (let ix = cx(e.minx); ix <= cx(e.maxx); ix++) {
          for (let iy = cy(e.miny); iy <= cy(e.maxy); iy++) { const id = iy * G + ix; (cells[id] || (cells[id] = [])).push(e); }
        }
      });
      this._spatial = { G, cx, cy, cells };
    }

    // Is (x,y) inside any OTHER country's painted shape? (spatial cell → bbox → exact ray-cast)
    _otherLand(x, y, ownIso) {
      const sp = this._spatial; if (!sp) return false;
      const arr = sp.cells[sp.cy(y) * sp.G + sp.cx(x)]; if (!arr) return false;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (e.iso3 === ownIso || x < e.minx || x > e.maxx || y < e.miny || y > e.maxy) continue;
        if (this._pointInPolys(x, y, e.polys)) return true;
      }
      return false;
    }

    // Route a label OUTSIDE the country, with a leader line + dot back to it — so EVERY
    // country gets a label (none are ever hidden). A coastal country prefers a clean pill
    // over the adjacent sea; everything else (landlocked, microstate) goes to the nearest
    // spot clear of other labels — over a neighbour is fine, because the leader line shows
    // which country it belongs to, exactly as crowded atlases label the Balkans / Gulf.
    _toLeader(d, ox, oy, ocean, S, placed, polyIndex, markerPts) {
      placed = placed || [];
      d.leadFromX = ox; d.leadFromY = oy;
      const oll = this.projection.invert ? this.projection.invert([ox, oy]) : null;
      const bears = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
      const place = (p, k) => { const s = S(k), hw = d.tw0 * s / (2 * k), hh = d.th0 * s / (2 * k); d.x = p[0]; d.y = p[1]; d.tier = 'leader'; d.kReveal = Math.max(d.kReveal || 1, k); placed.push({ l: p[0] - hw - 3, r: p[0] + hw + 3, t: p[1] - hh - 3, b: p[1] + hh + 3 }); };
      const clashAt = (x, y, hw, hh) => placed.some((b) => !(x + hw < b.l || x - hw > b.r || y + hh < b.t || y - hh > b.b));
      if (!(oll && isFinite(oll[0]) && isFinite(oll[1]))) { place([ox, oy - 16], 6); return; }

      // 1) COASTAL → a clean pill over the adjacent sea (prettiest). A long name only fits the
      //    nearby sea past a certain zoom, so walk a zoom ladder for the smallest that works.
      let coastal = false;
      for (let i = 0; i < bears.length && !coastal; i++) {
        for (const dd of [0.8, 1.2, 1.6]) { const c = this._dest(oll, bears[i], dd); if (ocean(c[0], c[1])) { coastal = true; break; } }
      }
      if (coastal) {
        // Push the pill a bit further into open water so the name never overlaps the country shape.
        const dists = [1.8, 2.6, 3.4, 4.4, 5.6, 7], kLadder = [2, 3, 4, 5.5, 7.5, 10, 14];
        for (let ki = 0; ki < kLadder.length; ki++) {
          const k = kLadder[ki], s = S(k), hw = d.tw0 * s / (2 * k), hh = d.th0 * s / (2 * k);
          let fb = null;
          for (let di = 0; di < dists.length; di++) {
            for (let bi = 0; bi < bears.length; bi++) {
              const c = this._dest(oll, bears[bi], dists[di]);
              if (!ocean(c[0], c[1])) continue;
              const p = this.projection(c);
              if (!p || !isFinite(p[0]) || !this._pillOcean(p, hw, hh, ocean)) continue;
              if (polyIndex && !this._pillClear(p[0], p[1], hw, hh, (d._polys || []), d.iso3, polyIndex, markerPts)) continue;
              if (!fb) fb = p;
              if (clashAt(p[0], p[1], hw, hh)) continue;
              place(p, k); return;
            }
          }
          if (fb) { place(fb, k); return; }
        }
      }

      // 2) LAND fallback (NEVER hide): nearest spot clear of other labels — over a neighbour
      //    is fine, the leader disambiguates. Smaller pills at higher zoom find room sooner.
      const dists2 = [1.4, 2.2, 3.2, 4.5, 6, 8], kL2 = [3, 4, 5.5, 7.5, 10, 14];
      for (let ki = 0; ki < kL2.length; ki++) {
        const k = kL2[ki], s = S(k), hw = d.tw0 * s / (2 * k), hh = d.th0 * s / (2 * k);
        for (let di = 0; di < dists2.length; di++) {
          for (let bi = 0; bi < bears.length; bi++) {
            const c = this._dest(oll, bears[bi], dists2[di]);
            const p = this.projection(c);
            if (!p || !isFinite(p[0]) || clashAt(p[0], p[1], hw, hh)) continue;
            place(p, k); return;
          }
        }
      }
      // 3) last resort — stack just above the country at max zoom (still never hidden)
      place([ox, oy - 14], 14);
    }

    _pillOcean(p, hw, hh, ocean) {
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
        const ll = this.projection.invert([p[0] + gx * hw, p[1] + gy * hh]);
        if (!ll || !isFinite(ll[0]) || !ocean(ll[0], ll[1])) return false;
      }
      return true;
    }

    _dest(ll, bearingDeg, distDeg) {
      const br = bearingDeg * Math.PI / 180;
      const lat = ll[1] + distDeg * Math.cos(br);
      const lon = ll[0] + distDeg * Math.sin(br) / Math.max(0.25, Math.cos(ll[1] * Math.PI / 180));
      return [lon, lat];
    }

    // Cheap per-zoom pass: position every label, toggle its visibility from its reveal
    // threshold (or force it for the hovered / selected country), and draw leaders.
    _applyLabelVisibility() {
      if (!this.gLabels) return;
      const k = this.k, ls = this._clabelScale();
      const hoverIso = this._hoverIso, selIso = this._selIso, showAll = this.labelsShowAll;
      this.gLabels.selectAll('g.clabel').each(function (d) {
        this.setAttribute('transform', `translate(${d.x},${d.y}) scale(${ls})`);
        this.classList.toggle('is-sel', !!(selIso && d.iso3 === selIso)); // the selected country's name pill
        const forced = d.iso3 && (d.iso3 === hoverIso || d.iso3 === selIso);
        const show = showAll || forced || (d.kShow != null && d.kShow !== Infinity && k >= d.kShow);
        this.style.display = show ? '' : 'none';
        if (!show) return;
        const leader = this.querySelector('path.clabel-leader'), ring = this.querySelector('circle.clabel-ring');
        if (d.tier === 'leader') {
          // The dot must stay ON the country (leadFrom) at every zoom — no length cap, or the
          // arrow detaches from the country when you zoom in.
          const ex = (d.leadFromX - d.x) / ls, ey = (d.leadFromY - d.y) / ls;
          leader.setAttribute('d', `M ${ex},${ey} L 0,0`);
          ring.setAttribute('cx', ex); ring.setAttribute('cy', ey); ring.style.display = '';
        } else {
          leader.setAttribute('d', ''); ring.style.display = 'none';
        }
      });
    }

    // Unified hover used by BOTH the name pill and the country shape, so they look
    // identical: highlight the country (accent) + grow its marker, fade the OTHER
    // name labels, lift the matching pill, and update the bottom name strip.
    _applyHover(iso3, country) {
      if (this._hoverIso && this._hoverIso !== iso3) { // un-highlight the previous one
        const prev = this._selectByIso(this._hoverIso);
        if (prev) { prev.sel.classed('label-hi', false); this._growMarker(prev, 5); }
      }
      this._hoverIso = iso3 || null;
      this.gLabels.selectAll('g.clabel.is-hovered').classed('is-hovered', false);
      if (iso3) {
        const hit = this._selectByIso(iso3);
        if (hit) { hit.sel.classed('label-hi', true).raise(); this._growMarker(hit, 9); }
        const node = this.gLabels.selectAll('g.clabel').nodes()
          .find((n) => n.__data__ && n.__data__.iso3 === iso3);
        if (node) d3.select(node).raise().classed('is-hovered', true);
        // (No longer dim every other label on hover — it made the whole map flicker/fade.)
        if (this.opts.onHover) this.opts.onHover(country || { name: '' });
      } else {
        this.gLabels.classed('dimmed', false);
        if (this.opts.onHover) this.opts.onHover(null);
      }
      // NOTE: we deliberately do NOT re-raise the selected country on every hover. That extra
      // DOM re-order (only triggered once something was selected) was eating the native click on
      // the NEXT country — so the very first selection worked but later territory clicks didn't.
      if (this.labelsOn) this._applyLabelVisibility(); // reveal the hovered name even if hidden
    }

    // Briefly defer the "clear" so sliding from a country's shape onto its own pill
    // (or a neighbour) doesn't flicker the fade off-and-on. setTimeout (not rAF) so it
    // always fires even if the tab is backgrounded — no stuck-dimmed state.
    _richHover(iso3, country, on) {
      if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }
      if (on) this._applyHover(iso3, country);
      else this._hoverTimer = setTimeout(() => { this._hoverTimer = null; this._applyHover(null); }, 40);
    }

    resize() {
      const [w, h] = this._size();
      if (w < 12 || h < 12) return;
      this._render();
    }

    // ---- interaction ----
    setInteractive(on) {
      this.interactive = on;
      this.el.classList.toggle('interactive', !!on);
      return this;
    }

    _hover(node, f, on) {
      if (!this.interactive) return;
      if (this.hoverMode && this.hoverMode !== 'country') return; // app handles continent/water hover
      // When all names are shown, hovering the shape mirrors hovering its name.
      if (this.labelsOn && f.country) { this._richHover(f.country.iso3, f.country, on); return; }
      d3.select(node).classed('hover', on && !!f.country);
      if (this.opts.onHover) this.opts.onHover(on ? (f.country || { name: f.displayName }) : null);
    }

    _hoverMarker(node, c, on) {
      if (!this.interactive) return;
      if (this.hoverMode && this.hoverMode !== 'country') return;
      if (this.labelsOn) { this._richHover(c.iso3, c, on); return; }
      if (on) this.gMarks.selectAll('circle.hover').classed('hover', false); // never leave a stuck hover behind
      d3.select(node).classed('hover', on);
      if (this.opts.onHover) this.opts.onHover(on ? c : null);
    }

    _click(e, f) {
      if (!this.interactive || !this.opts.onPick) return;
      // Also report WHERE on the globe the click landed, so water-finding quizzes can resolve a
      // land click (e.g. tapping Egypt for the Red Sea) to the nearest water body.
      let lat = null, lon = null;
      try { const m = d3.pointer(e, this.g.node()); const ll = this.projection.invert && this.projection.invert(m); if (ll && isFinite(ll[0]) && isFinite(ll[1])) { lon = ll[0]; lat = ll[1]; } } catch (_) {}
      this.opts.onPick({
        iso3: f.country ? f.country.iso3 : null,
        country: f.country || null,
        name: f.displayName,
        isCountry: !!f.country,
        lat, lon,
      });
    }

    _clickMarker(c) {
      if (!this.interactive || !this.opts.onPick) return;
      // carry the marker's location too, so proximity scoring works for microstate taps
      this.opts.onPick({ iso3: c.iso3, country: c, name: c.name, isCountry: true, lat: c.latlng ? c.latlng[0] : null, lon: c.latlng ? c.latlng[1] : null });
    }

    // ---- visual state ----
    _selectByIso(iso3) {
      const node = this.gLand.selectAll('path').nodes()
        .find((n) => n.__data__.country && n.__data__.country.iso3 === iso3);
      if (node) return { sel: d3.select(node), kind: 'path', datum: node.__data__ };
      const mnode = this.gMarks.selectAll('circle').nodes()
        .find((n) => n.__data__.iso3 === iso3);
      if (mnode) return { sel: d3.select(mnode), kind: 'marker', datum: mnode.__data__ };
      return null;
    }

    clearStates() {
      this._selIso = null;
      this.gLand.selectAll('path').classed('is-target is-soft hover label-hi flash-correct flash-wrong picked', false);
      const k = this.k;
      // NOTE: markers must clear 'hover'/'label-hi' too (they didn't) — otherwise a marker whose
      // mouseleave was missed stays --accent blue and such stuck markers pile up over a long round.
      this.gMarks.selectAll('circle')
        .classed('is-target is-soft hover label-hi flash-correct flash-wrong picked', false)
        .each(function (d) { d._r = 5; })
        .attr('r', 5 / k);
      this.clearTags();
      return this;
    }

    // ---- answer name tags: a green "correct" + red "wrong" pill on the map ----
    _isoPoint(iso3) {
      const hit = this._selectByIso(iso3);
      if (!hit) return null;
      if (hit.kind === 'path') {
        const c = this.path.centroid(hit.datum);
        return (isFinite(c[0]) && isFinite(c[1])) ? c : null;
      }
      return this.projection([hit.datum.latlng[1], hit.datum.latlng[0]]);
    }

    // Overlay (answer tags + the "which one?" ask marker) is stored as STATE and
    // redrawn from _render(), so it survives the re-renders that happen as the round
    // screen settles. clearStates()/clearTags() wipe it for the next question.
    showTags(items) { this._ovTags = items || []; this._drawOverlay(); return this; }
    markAsk(latlng) { this._ovAsk = latlng || null; this._drawOverlay(); return this; }

    _drawOverlay() {
      if (!this.gTags) return;
      this.gTags.selectAll('*').remove();
      const s = this._labelScale();
      if (this._ovAsk) {
        const p = this.projection([this._ovAsk[1], this._ovAsk[0]]);
        if (p && isFinite(p[0])) {
          const g = this.gTags.append('g').attr('class', 'ask-mark').attr('transform', `translate(${p[0]},${p[1]}) scale(${s})`);
          g.append('circle').attr('class', 'ask-ring').attr('r', 10);
          g.append('circle').attr('class', 'ask-dot').attr('r', 3.2);
        }
      }
      const k = this.k, grow = s * k; // on-screen scale of the pill content
      const data = (this._ovTags || []).map((it) => {
        let p = null, cw = Infinity, ch = Infinity; // cw/ch = the country's on-screen size
        if (it.latlng) { p = this.projection([it.latlng[1], it.latlng[0]]); }
        else {
          const hit = this._selectByIso(it.iso3);
          if (hit && hit.kind === 'path') {
            const c = this.path.centroid(hit.datum); if (isFinite(c[0])) p = c;
            const b = this.path.bounds(hit.datum); cw = (b[1][0] - b[0][0]) * k; ch = (b[1][1] - b[0][1]) * k;
            // Date-line straddler (e.g. Fiji): d3.geoBounds' west lon > east lon means the shape wraps
            // 180°, so its centroid lands in the wrong ocean — anchor on the curated latlng instead.
            const ll = hit.datum.country && hit.datum.country.latlng, gb = d3.geoBounds(hit.datum);
            if (ll && gb[0][0] > gb[1][0]) { const q = this.projection([ll[1], ll[0]]); if (q && isFinite(q[0])) p = q; }
          } else if (hit && hit.kind === 'marker') {
            p = this.projection([hit.datum.latlng[1], hit.datum.latlng[0]]); cw = ch = 5;
          }
        }
        return (p && isFinite(p[0])) ? { id: it.iso3 || it.label, label: it.label, kind: it.kind, x: p[0], y: p[1], cw, ch } : null;
      }).filter(Boolean);
      const merged = this.gTags.selectAll('g.atag').data(data, (d) => d.id).join((en) => {
        const g = en.append('g');
        g.append('path').attr('class', 'atag-leader');
        g.append('circle').attr('class', 'atag-ring').attr('cx', 0).attr('cy', 0).attr('r', 2.6);
        g.append('rect').attr('class', 'atag-bg');
        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.32em');
        return g;
      });
      merged.attr('class', (d) => 'atag atag-' + d.kind).attr('transform', (d) => `translate(${d.x},${d.y}) scale(${s})`);
      merged.select('text').text((d) => d.label);
      const padX = 9, padY = 5;
      merged.each(function (d, idx) {
        const text = this.querySelector('text'), rect = this.querySelector('rect');
        const leader = this.querySelector('path.atag-leader'), ring = this.querySelector('circle.atag-ring');
        text.setAttribute('x', 0); text.setAttribute('y', 0);
        let bb; try { bb = text.getBBox(); } catch (_) { bb = { width: 0, height: 0 }; }
        const Wp = (bb.width + 2 * padX) * grow, Hp = (bb.height + 2 * padY) * grow; // on-screen pill size
        // Push the pill OFF the country (leader line + dot on the country) whenever it would cover a
        // meaningful chunk of it — not only when the country is smaller than the pill. This keeps the
        // country's shape visible even when the answer-reveal zooms in on a small country (Switzerland).
        const needLeader = Wp > d.cw * 0.5 || Hp > d.ch * 0.5;
        let ox = 0, oy = 0;
        if (needLeader) {
          const dir = (idx % 2 === 0) ? 1 : -1; // alternate below / above so two tags don't stack
          oy = dir * (d.ch / 2 + Hp / 2 + 12) / grow; // clear the country's bounding box + a small gap
        }
        text.setAttribute('x', ox); text.setAttribute('y', oy);
        let bb2; try { bb2 = text.getBBox(); } catch (_) { bb2 = { x: ox, y: oy, width: 0, height: 0 }; }
        const h = bb2.height + padY * 2;
        rect.setAttribute('x', bb2.x - padX); rect.setAttribute('y', bb2.y - padY);
        rect.setAttribute('width', bb2.width + padX * 2); rect.setAttribute('height', h);
        rect.setAttribute('rx', h / 2); rect.setAttribute('ry', h / 2);
        if (needLeader) { leader.setAttribute('d', `M 0,0 L ${ox},${oy}`); ring.style.display = ''; }
        else { leader.setAttribute('d', ''); ring.style.display = 'none'; }
      });
      this.gTags.raise();
    }

    clearTags() { this._ovTags = []; this._ovAsk = null; if (this.gTags) this.gTags.selectAll('*').remove(); return this; }

    // ---- place labels (continents / oceans / waters): tappable pills at lat-lon ----
    // onHover(item, on) lets the app light up the whole continent / water area while the
    // pill (or its map area) is hovered — so name and area behave the same.
    showPlaces(items, onTap, onHover) {
      const data = (items || []).map((it) => {
        const p = this.projection([it.latlng[1], it.latlng[0]]);
        return (p && isFinite(p[0]) && isFinite(p[1])) ? Object.assign({}, it, { x: p[0], y: p[1] }) : null;
      }).filter(Boolean);
      const s = this._labelScale();
      const groups = this.gPlaces.selectAll('g.place').data(data, (d) => d.key || d.name);
      groups.exit().remove();
      const enter = groups.enter().append('g')
        .on('click', (e, d) => { if (onTap) onTap(d); })
        .on('mouseenter', (e, d) => { d3.select(e.currentTarget).raise().classed('is-hovered', true); if (onHover) onHover(d, true); })
        .on('mouseleave', (e, d) => { d3.select(e.currentTarget).classed('is-hovered', false); if (onHover) onHover(d, false); });
      // leader (line + anchor dot) sits UNDER the pill — only used for rivers/lakes so the
      // name floats off the water instead of covering it. The pill wraps rect+text so we can
      // lift it as one unit while the dot stays pinned on the water point.
      enter.append('line').attr('class', 'place-leader');
      enter.append('circle').attr('class', 'place-dot').attr('r', 3);
      const pill = enter.append('g').attr('class', 'place-pill');
      pill.append('rect').attr('class', 'place-bg');
      pill.append('text').attr('text-anchor', 'middle').attr('dy', '0.32em');
      const merged = enter.merge(groups);
      merged.attr('class', (d) => 'place place-' + (d.type || 'continent') + (d._static ? ' is-static' : '')) // _static = label only, not clickable
        .attr('transform', (d) => `translate(${d.x},${d.y}) scale(${s})`);
      merged.select('text').text((d) => d.label || d.name);
      const padX = 10, padY = 6;
      merged.each(function (d) {
        try {
          const bb = this.querySelector('text').getBBox();
          const h = bb.height + padY * 2;
          const r = this.querySelector('.place-bg');
          r.setAttribute('x', bb.x - padX);
          r.setAttribute('y', bb.y - padY);
          r.setAttribute('width', bb.width + padX * 2);
          r.setAttribute('height', h);
          r.setAttribute('rx', h / 2); r.setAttribute('ry', h / 2);
          const lead = (d.type === 'river' || d.type === 'lake');
          const pillG = this.querySelector('.place-pill');
          const lineEl = this.querySelector('.place-leader');
          const dotEl = this.querySelector('.place-dot');
          if (lead) {
            const oy = -(h / 2 + 14);                 // lift the pill above the water point
            pillG.setAttribute('transform', `translate(0,${oy})`);
            lineEl.setAttribute('x1', 0); lineEl.setAttribute('y1', 0);
            lineEl.setAttribute('x2', 0); lineEl.setAttribute('y2', oy + h / 2);
            lineEl.style.display = ''; dotEl.style.display = '';
          } else {
            pillG.removeAttribute('transform');
            lineEl.style.display = 'none'; dotEl.style.display = 'none';
          }
        } catch (_) { /* not laid out yet */ }
      });
      return this;
    }

    clearPlaces() { if (this.gPlaces) this.gPlaces.selectAll('*').remove(); return this; }

    // Highlight a whole SET of countries (e.g. every country of a continent). cls picks
    // the look (is-soft / flash-correct / flash-wrong); keep=true won't clear other states.
    highlightSet(isoList, cls, keep) {
      cls = cls || 'is-soft';
      if (!keep) this.clearStates();
      const set = new Set(isoList || []);
      this.gLand.selectAll('path').classed(cls, (d) => d.country && set.has(d.country.iso3));
      // NOTE: do NOT .raise() the highlighted paths — re-ordering the DOM on every hover ate the
      // native click on the next country (continent territory was unclickable after one selection).
      // Highlights are solid fills and neighbours don't overlap, so z-order doesn't matter here.
      this.gMarks.selectAll('circle').each(function (d) { d3.select(this).classed(cls, set.has(d.iso3)); });
      return this;
    }


    _growMarker(hit, r) {
      if (hit && hit.kind === 'marker') { hit.datum._r = r; hit.sel.attr('r', r / this.k); }
    }

    highlight(iso3, opts) {
      this.clearStates();
      this._selIso = iso3; // keep the selected country's name visible at any zoom
      const hit = this._selectByIso(iso3);
      if (hit) {
        const soft = !!(opts && opts.soft);
        hit.sel.classed(soft ? 'is-soft' : 'is-target', true).raise();
        if (!soft) this._growMarker(hit, 9);
        if (!opts || opts.focus !== false) this.focus(iso3, opts);
      }
      if (this.labelsOn) this._applyLabelVisibility();
      return this;
    }

    flash(iso3, correct) {
      const hit = this._selectByIso(iso3);
      if (hit) { hit.sel.classed(correct ? 'flash-correct' : 'flash-wrong', true).raise(); this._growMarker(hit, 8); }
      return this;
    }

    // Zoom to a single country. opts.instant snaps without animating; opts.padTop /
    // opts.padBottom reserve screen space (for a floating prompt / dock) so the
    // country is framed into the CLEAR band between them, not the raw viewport.
    focus(iso3, opts) {
      const hit = this._selectByIso(iso3);
      if (!hit) return this;
      const [w, h] = this._size();
      const padTop = (opts && opts.padTop) || 0;
      const padBottom = (opts && opts.padBottom) || 0;
      const effH = Math.max(60, h - padTop - padBottom);
      const dur = opts && opts.instant ? 0 : undefined;
      let cx, cy, k;
      if (hit.kind === 'path') {
        const b = this.path.bounds(hit.datum);
        const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
        cx = (b[0][0] + b[1][0]) / 2; cy = (b[0][1] + b[1][1]) / 2;
        k = Math.max(1, Math.min(8, 0.55 * Math.min(w / dx, effH / dy)));
      } else {
        const p = this.projection([hit.datum.latlng[1], hit.datum.latlng[0]]);
        cx = p[0]; cy = p[1]; k = 6;
      }
      // Shift so the target sits at the centre of the clear band, not the viewport centre.
      const cyAdj = cy + (padBottom - padTop) / (2 * k);
      this._zoomTo(cx, cyAdj, k, dur);
      return this;
    }

    // Frame a continent by a fixed geographic box. Using country shapes here
    // is unreliable because transcontinental countries (e.g. Russia is region
    // "Europe" yet reaches the Pacific) blow the bounding box wide open.
    focusRegion(region) {
      const BBOX = {
        // [west lon, south lat, east lon, north lat]
        Africa: [-20, -37, 52, 38],
        Americas: [-168, -56, -34, 73],
        Asia: [26, -11, 150, 78],
        Europe: [-25, 34, 46, 71],
        Oceania: [110, -48, 179, 9],
      };
      const box = BBOX[region];
      if (!box) return this.resetView();
      const [wlon, slat, elon, nlat] = box;
      const pts = [];
      const N = 6;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        pts.push([wlon + (elon - wlon) * t, slat], [wlon + (elon - wlon) * t, nlat]);
        pts.push([wlon, slat + (nlat - slat) * t], [elon, slat + (nlat - slat) * t]);
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach((p) => {
        const q = this.projection(p);
        if (!q) return;
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]);
        x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      });
      const [w, h] = this._size();
      const dx = x1 - x0, dy = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const k = Math.max(1, Math.min(8, 0.92 * Math.min(w / dx, h / dy)));
      this._zoomTo(cx, cy, k, 650);
      return this;
    }

    // Is the country's centre currently inside the visible map area?
    isVisible(iso3) {
      const hit = this._selectByIso(iso3);
      if (!hit) return true;
      const p = (hit.kind === 'path')
        ? this.path.centroid(hit.datum)
        : this.projection([hit.datum.latlng[1], hit.datum.latlng[0]]);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return true;
      const t = d3.zoomTransform(this.svg.node());
      const [w, h] = this._size();
      const sx = t.applyX(p[0]), sy = t.applyY(p[1]);
      const mx = w * 0.06, my = h * 0.06;
      return sx > mx && sx < w - mx && sy > my && sy < h - my;
    }

    // Zoom/pan (out only — never in) so all the given countries are visible.
    fitCountries(isoList) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      isoList.forEach((iso) => {
        const hit = this._selectByIso(iso);
        if (!hit) return;
        if (hit.kind === 'path') {
          const b = this.path.bounds(hit.datum);
          x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]);
          x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]);
        } else {
          const p = this.projection([hit.datum.latlng[1], hit.datum.latlng[0]]);
          x0 = Math.min(x0, p[0] - 12); y0 = Math.min(y0, p[1] - 12);
          x1 = Math.max(x1, p[0] + 12); y1 = Math.max(y1, p[1] + 12);
        }
      });
      if (!isFinite(x0)) return this;
      const [w, h] = this._size();
      const dx = Math.max(x1 - x0, 1), dy = Math.max(y1 - y0, 1);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const fitK = Math.max(1, Math.min(8, 0.55 * Math.min(w / dx, h / dy)));
      const curK = d3.zoomTransform(this.svg.node()).k || fitK;
      this._zoomTo(cx, cy, Math.min(fitK, curK), 0);
      return this;
    }

    // Like fitCountries but may zoom IN a little (capped) so the revealed countries are well
    // defined — used on the find-on-map answer reveal. Generous padding = a gentle, not tight, zoom.
    frameCountries(isoList, maxK) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      (isoList || []).forEach((iso) => {
        const hit = this._selectByIso(iso);
        if (!hit) return;
        if (hit.kind === 'path') {
          const b = this.path.bounds(hit.datum);
          x0 = Math.min(x0, b[0][0]); y0 = Math.min(y0, b[0][1]);
          x1 = Math.max(x1, b[1][0]); y1 = Math.max(y1, b[1][1]);
        } else {
          const p = this.projection([hit.datum.latlng[1], hit.datum.latlng[0]]);
          x0 = Math.min(x0, p[0] - 14); y0 = Math.min(y0, p[1] - 14);
          x1 = Math.max(x1, p[0] + 14); y1 = Math.max(y1, p[1] + 14);
        }
      });
      if (!isFinite(x0)) return this;
      const [w, h] = this._size();
      const dx = Math.max(x1 - x0, 1), dy = Math.max(y1 - y0, 1);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const fitK = Math.max(1, Math.min(maxK || 4.5, 0.42 * Math.min(w / dx, h / dy)));
      this._zoomTo(cx, cy, fitK, 0); // INSTANT — d3 zoom transitions stick in the fixed full-window round map
      return this;
    }

    _zoomTo(cx, cy, k, dur) {
      const [w, h] = this._size();
      const t = d3.zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-cx, -cy);
      if (dur === 0) this.svg.call(this.zoom.transform, t);
      else this.svg.transition().duration(dur == null ? 650 : dur).call(this.zoom.transform, t);
    }

    zoomBy(factor) { this.svg.call(this.zoom.scaleBy, factor); return this; }

    // Instant reset — reliable even mid-resize, where a zoom transition can stick.
    resetView() {
      this.svg.interrupt();
      this.svg.call(this.zoom.transform, d3.zoomIdentity);
      return this;
    }
  }

  window.GlobeMap = GlobeMap;
})();
