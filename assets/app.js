/* Globe Quest — game controller + UI.
 *
 * Everything the player sees and does lives here. The country content comes
 * from window.COUNTRIES (data/countries.js) and the map from GlobeMap (map.js).
 * Game modes are declared in MODES — add or tweak one there.
 */
(function () {
  'use strict';

  // ALL = quiz-eligible countries (the 194 UN members). Territories (e.g. French Polynesia) are
  // explorable markers only — excluded from every quiz pool, distractor set, and search.
  const ALL = window.COUNTRIES.filter((c) => !c.territory);
  const BY_ISO3 = {};
  const BY_NAME = {};
  window.COUNTRIES.forEach((c) => { BY_ISO3[c.iso3] = c; BY_NAME[c.name] = c; }); // lookups include territories
  const ICON = window.icon;

  // Continents + water bodies (data/continents.js, data/waters.js).
  const CONTINENTS = window.CONTINENTS || [];
  const WATERS = window.WATERS || [];
  const continentKeyOf = (c) =>
    c.region === 'Americas' ? (c.subregion === 'South America' ? 'south-america' : 'north-america')
      : ({ Africa: 'africa', Asia: 'asia', Europe: 'europe', Oceania: 'oceania' }[c.region]
        || (c.region === 'Antarctic' ? 'antarctica' : null));
  const CONTINENT_MEMBERS = {};
  ALL.forEach((c) => { const k = continentKeyOf(c); if (k) (CONTINENT_MEMBERS[k] = CONTINENT_MEMBERS[k] || []).push(c); });

  // ---------- regions: a finer layer than continents (data/regions.js) ----------
  const RDEF = window.REGIONS_DEF || { subregions: {}, custom: [] };
  const regSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  // antimeridian-safe rough centre of a set of countries, for the on-map label pill
  const midLatLng = (members) => {
    const pts = members.filter((c) => c.latlng);
    if (!pts.length) return [0, 0];
    const lons = pts.map((c) => c.latlng[1]);
    const wide = Math.max(...lons) - Math.min(...lons) > 180; // straddles 180° (Pacific groups)
    let la = 0, lo = 0;
    pts.forEach((c) => { la += c.latlng[0]; let L = c.latlng[1]; if (wide && L < 0) L += 360; lo += L; });
    la /= pts.length; lo /= pts.length; if (lo > 180) lo -= 360;
    return [Math.round(la * 10) / 10, Math.round(lo * 10) / 10];
  };
  const SUB_MEMBERS = {};
  ALL.forEach((c) => { if (c.subregion) (SUB_MEMBERS[c.subregion] = SUB_MEMBERS[c.subregion] || []).push(c); });
  // Standard subregions — used by BOTH Find and Name (every country has exactly one).
  const REGIONS_STD = Object.entries(RDEF.subregions).map(([sub, meta]) => {
    const members = SUB_MEMBERS[sub] || [];
    return members.length ? { key: regSlug(meta.name), name: meta.name, sub, members, latlng: midLatLng(members), fact: meta.fact, custom: false } : null;
  }).filter(Boolean);
  // Famous informal regions — Find only (they overlap the subregions, so naming would be ambiguous).
  const REGIONS_CUSTOM = (RDEF.custom || []).map((r) => {
    const members = r.iso.map((iso) => BY_ISO3[iso]).filter((c) => c && !c.territory);
    return members.length ? { key: r.key, name: r.name, members, latlng: midLatLng(members), fact: r.fact, custom: true } : null;
  }).filter(Boolean);
  const REGIONS_ALL = REGIONS_STD.concat(REGIONS_CUSTOM);
  const REGION_BY_KEY = {}; REGIONS_ALL.forEach((r) => { REGION_BY_KEY[r.key] = r; });
  const SUB_TO_REGION = {}; REGIONS_STD.forEach((r) => { SUB_TO_REGION[r.sub] = r; });
  const regionKeyOf = (c) => { const r = c && SUB_TO_REGION[c.subregion]; return r ? r.key : null; }; // the STANDARD region a country is in

  // ---------- configuration (easy to adjust) ----------
  const MODES = [
    { id: 'find-map',     icon: 'crosshair',    title: 'Find on the Map', desc: 'We name it — you find it.', map: true },
    { id: 'name-country', icon: 'pin',          title: 'Name the Country', desc: "It's glowing — what is it?", map: true },
    { id: 'guess-flag',   icon: 'flag',         title: 'Guess the Flag',   desc: 'See a flag, pick the country.' },
    { id: 'match-flag',   icon: 'grid',         title: 'Match the Flag',   desc: 'See a country, pick its flag.' },
    { id: 'capital',      icon: 'landmark',     title: 'Capital City',     desc: 'Which city is the capital?', capital: true },
    { id: 'which-country',icon: 'building',     title: 'Which Country?',   desc: 'A capital — name its country.', capital: true },
    { id: 'mixed',        icon: 'shuffle',      title: 'Mix It Up',        desc: 'A little of everything.' },
    { id: 'explore',      icon: 'compass',      title: 'Explore the Atlas',desc: 'Roam freely — countries, continents, oceans. No score.', explore: true },
  ];

  const REGIONS = [
    { id: 'all', label: '🌍 Whole world' },
    { id: 'Africa', label: 'Africa' },
    { id: 'Americas', label: 'Americas' },
    { id: 'Asia', label: 'Asia' },
    { id: 'Europe', label: 'Europe' },
    { id: 'Oceania', label: 'Oceania' },
  ];

  const LENGTHS = [
    { id: 10, label: 'Quick · 10' },
    { id: 20, label: 'Standard · 20' },
    { id: 'all', label: 'Marathon · all' },
  ];

  const SUBMODES = ['find-map', 'name-country', 'guess-flag', 'match-flag', 'capital', 'which-country'];

  // Object categories — labels shared by the home cards and the Explore toggle.
  const CAT_LABEL = { countries: 'Countries', continents: 'Continents', regions: 'Regions', oceans: 'Oceans & Seas', rivers: 'Rivers & Lakes', capitals: 'Capitals', flags: 'Flags' };
  const OCEAN_TYPES = ['ocean', 'sea', 'gulf'];
  const RIVERLAKE_TYPES = ['river', 'lake'];

  // The four games on the home screen. Each shows category chips (except Mix) + a hover tip.
  // art = an Ume pose from the Plum Mascot set (assets/ume/2d-*.png) shown top-right of the group.
  const GAMES = [
    { id: 'find', icon: 'crosshair', art: 'el-ume-runner', title: 'Find on Map', sub: 'We name it — you find it.',
      tip: 'We name a place — a country, continent, ocean, river, lake or capital, or show a flag — and you find and tap it on the map.',
      cats: ['countries', 'continents', 'regions', 'oceans', 'rivers', 'capitals', 'flags'] },
    { id: 'name', icon: 'pin', art: '2d-determined', title: 'Name It', sub: 'We show it — you name it.',
      tip: 'We mark a place on the map (or show a flag) and you pick its name from four choices.',
      cats: ['countries', 'continents', 'regions', 'oceans', 'rivers', 'capitals', 'flags'] },
    { id: 'match', icon: 'grid', art: 'el-ume-cards', title: 'Match', sub: 'Find the right match.',
      tip: 'Match a country to its flag or capital, or a country to the continent it belongs to — pick the right pair.',
      cats: ['flags', 'capitals', 'continents'] },
    { id: 'mix', icon: 'shuffle', art: '2d-celebrating', title: 'Mix', sub: 'A little of everything.',
      tip: 'Finding, naming, flags and capitals — every kind of question, all shuffled together.',
      cats: [] },
  ];
  const EXPLORE_CATS = ['countries', 'continents', 'regions', 'oceans', 'rivers']; // capitals/flags appear inside the info panel
  // Palette index per continent → solid continent blobs reuse the country colours.
  const CONT_CI = { africa: 3, asia: 1, europe: 4, 'north-america': 0, 'south-america': 2, antarctica: 6, oceania: 7 };
  // Non-UN TERRITORIES (no country record) mapped to the continent they belong to — so they colour
  // + tap as part of that continent in the Continents game (keyed by the topojson display name).
  const TERRITORY_CONT = {
    'Greenland': 'north-america', 'Puerto Rico': 'north-america',
    'W. Sahara': 'africa', 'Somaliland': 'africa',
    'Kosovo': 'europe',
    'Taiwan': 'asia', 'Palestine': 'asia', 'N. Cyprus': 'asia',
    'Falkland Is.': 'south-america',
    'New Caledonia': 'oceania',
    'Antarctica': 'antarctica', 'Fr. S. Antarctic Lands': 'antarctica',
  };
  function continentColorIndex() {
    const m = {};
    CONTINENTS.forEach((c) => (CONTINENT_MEMBERS[c.key] || []).forEach((mm) => { m[mm.iso3] = CONT_CI[c.key] != null ? CONT_CI[c.key] : 7; }));
    return m;
  }
  // Land-colouring fn for the Continents/Oceans views: each country coloured by its continent, plus
  // territories (Greenland, Antarctica, …) coloured as part of their continent instead of grey.
  function continentLandColoring() {
    const ci = continentColorIndex();
    return (f) => {
      if (f.country && ci[f.country.iso3] != null) return 'country c' + ci[f.country.iso3];
      const tk = TERRITORY_CONT[f.displayName];
      return tk ? 'country is-territory c' + CONT_CI[tk] : 'country is-territory land-muted';
    };
  }
  // The continent a clicked feature belongs to — a country's continent, OR a territory's (Greenland
  // → North America, the Antarctica landmass → antarctica). null if it's not on any continent.
  const continentKeyOfPick = (pick) => pick && (pick.country ? continentKeyOf(pick.country) : (TERRITORY_CONT[pick.name] || null));
  // Antarctica has no member countries — it's a single territory landmass we treat as a continent.
  const isAntarctica = (f) => !!f && !f.country && f.displayName === 'Antarctica';
  function highlightAntarctica(on, cls) {
    const map = S.exploreMap; if (!map) return;
    const s = map.gLand.selectAll('path').filter((f) => isAntarctica(f));
    s.classed('is-soft', false).classed('is-target', false);
    if (on) { s.classed(cls || 'is-soft', true).raise(); }
  }
  // Clear any country/continent/water selection and hide the info panel (click on empty water/land).
  function deselectExplore() {
    const map = S.exploreMap; if (!map) return;
    S.selContinent = null; S.selWater = null;
    map.clearStates(); map.clearWaterArea();
    map.gPlaces.selectAll('g.place').classed('is-hovered', false).classed('is-sel', false);
    $('atlasCard').classList.remove('shown');
    if (map.labelsOn) map._applyLabelVisibility();
  }

  function resolveMode(game, cat) {
    if (game === 'mix') return 'mixed';
    if (game === 'find') return { countries: 'find-map', continents: 'find-continent', regions: 'find-region', oceans: 'find-ocean', rivers: 'find-river', capitals: 'find-capital', flags: 'find-flag' }[cat];
    if (game === 'name') return { countries: 'name-country', continents: 'name-continent', regions: 'name-region', oceans: 'name-ocean', rivers: 'name-river', capitals: 'capital', flags: 'guess-flag' }[cat];
    if (game === 'match') return { flags: 'match-flag', capitals: 'capital', continents: 'match-continent' }[cat];
    return game;
  }
  // Launch a quiz, remembering the game + category so the in-quiz chip bar can switch category live.
  function startCategory(game, cat, opts) {
    S.game = game;
    S.cat = cat || (GAMES.find((g) => g.id === game) || {}).cats?.[0] || 'countries';
    startRound(resolveMode(game, S.cat), opts);
  }

  // The in-quiz category chips — same selector as Explore, scoped to the current game's categories.
  function buildRoundModes() {
    const box = $('roundModes');
    const game = GAMES.find((g) => g.id === S.game);
    if (!game || game.cats.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false; box.innerHTML = '';
    game.cats.forEach((cat) => {
      const b = el('button', 'chip' + (cat === S.cat ? ' active' : ''), CAT_LABEL[cat]);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', cat === S.cat ? 'true' : 'false');
      b.onclick = () => { if (cat !== S.cat) startCategory(S.game, cat); };
      box.appendChild(b);
    });
  }

  // Give the quiz map the Explorer's per-category look (minus the name labels, which would
  // give the answer away): coloured continents for continent/ocean quizzes, muted land for rivers.
  // Light up a whole continent on a given map (used by Explore hover/select AND the continent quiz).
  function highlightContinentOn(map, key, cls, keep) {
    if (!map || !key) return;
    map.highlightSet((CONTINENT_MEMBERS[key] || []).map((c) => c.iso3), cls, keep);
    // also light up this continent's TERRITORIES (Greenland → N. America, the Antarctica landmass, …)
    map.gLand.selectAll('path').filter((f) => !f.country && TERRITORY_CONT[f.displayName] === key).classed(cls, true);
  }
  // Wire (or clear) whole-continent hover on the ROUND map — used ONLY by Find-the-continent
  // (you tap a country; the whole continent lights up). Name-the-continent must NOT use this, or
  // moving the mouse would wipe the target highlight.
  function setQuizContinentHover(on) {
    const map = S.roundMap; if (!map) return;
    const land = map.gLand.selectAll('path');
    if (on) {
      land.on('mouseenter.qc', (e, f) => { if (S.answered) return; const k = f.country ? continentKeyOf(f.country) : (TERRITORY_CONT[f.displayName] || null); if (k) highlightContinentOn(map, k, 'is-soft'); })
          .on('mouseleave.qc', () => { if (!S.answered) map.gLand.selectAll('path').classed('is-soft', false); });
    } else {
      land.on('mouseenter.qc', null).on('mouseleave.qc', null);
    }
  }

  // ----- regions on the map (highlight a group of countries; hover lights up a whole subregion) -----
  function highlightRegionOn(map, region, cls, keep) {
    if (!map || !region) return;
    map.highlightSet((region.members || []).map((c) => c.iso3), cls, keep);
  }
  function setQuizRegionHover(on) {
    const map = S.roundMap; if (!map) return;
    const land = map.gLand.selectAll('path');
    if (on) {
      land.on('mouseenter.qr', (e, f) => { if (S.answered) return; const k = f.country && regionKeyOf(f.country); if (k) highlightRegionOn(map, REGION_BY_KEY[k], 'is-soft'); })
          .on('mouseleave.qr', () => { if (!S.answered) map.gLand.selectAll('path').classed('is-soft', false); });
    } else {
      land.on('mouseenter.qr', null).on('mouseleave.qr', null);
    }
  }

  function applyQuizMapStyle(cat) {
    const map = S.roundMap; if (!map) return;
    map.clearWaterArea(); map.clearWaterShapes(); // drop any previous reveal's water highlight/regions
    map.setLandColoring(null); map.setBordersHidden(false);
    map.setShowAllLabels(false); map.setMarkersHidden(false);
    // keep microstate marker colours in sync with the (possibly reshuffled) palette — only touch the
    // cN colour class so any state class (flash/hover) is preserved.
    map.gMarks.selectAll('circle').each(function (c) { for (let i = 0; i < 8; i++) this.classList.remove('c' + i); this.classList.add('c' + c._color); });
    setQuizContinentHover(false); setQuizRegionHover(false); // off by default; find-continent/region re-enable
    // Continent + region + water quizzes drive their own hover (whole group / water area), so the
    // built-in per-country hover is off; plain country quizzes keep it.
    map.setHoverMode((cat === 'oceans' || cat === 'rivers' || cat === 'continents' || cat === 'regions') ? 'off' : 'country');
    if (cat === 'continents' || cat === 'oceans') {
      map.setLandColoring(continentLandColoring());
      map.setBordersHidden(true); map.setMarkersHidden(true);
    } else if (cat === 'rivers') {
      map.setLandColoring((f) => 'country land-muted' + (f.country ? '' : ' is-territory'));
      map.setMarkersHidden(true);
    }
  }

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const flagSvg = (iso2) => `https://flagcdn.com/${iso2.toLowerCase()}.svg`;
  const onFlagError = "this.classList.add('flag-missing');this.alt=this.dataset.iso||'';";

  function distractors(answer, n, opts) {
    const needCap = opts && opts.capital;
    const tiers = [
      ALL.filter((c) => c.subregion === answer.subregion),
      ALL.filter((c) => c.region === answer.region),
      ALL,
    ];
    const used = new Set([answer.iso3]);
    const out = [];
    for (const tier of tiers) {
      for (const c of shuffle(tier)) {
        if (out.length >= n) break;
        if (used.has(c.iso3)) continue;
        if (needCap && !c.capital) continue;
        used.add(c.iso3);
        out.push(c);
      }
      if (out.length >= n) break;
    }
    return out;
  }

  // ---------- state ----------
  const S = {
    regions: new Set(), // empty = whole world; otherwise the chosen continents
    length: 10,
    mode: null,
    game: null, // current quiz game id ('find'|'name'|'match'|'mix') — drives the in-quiz chip bar
    cat: null,  // current quiz category ('countries'|'continents'|'oceans'|'rivers'|'capitals'|'flags')
    queue: [],
    index: 0,
    score: 0,
    streak: 0,
    misses: [],
    answered: false,
    roundMap: null,
    exploreMap: null,
    previewMap: null,
  };

  // Anonymous analytics (no-op unless assets/config.js is filled in). Never throws.
  const GQA = window.GQA || { init() {}, roundStart() {}, answer() {}, roundComplete() {} };

  // ---------- screen routing ----------
  function show(screen) {
    // leaving any screen also leaves fullscreen
    document.querySelectorAll('.map-panel.is-fullscreen').forEach((p) => p.classList.remove('is-fullscreen'));
    document.body.classList.remove('has-fullscreen-map', 'full-map', 'map-quiet', 'map-interactive');
    if ($('pvFull')) $('pvFull').innerHTML = ICON('expand');
    ['homeScreen', 'roundScreen', 'exploreScreen', 'previewScreen', 'resultsScreen'].forEach((s) => { $(s).hidden = (s !== screen); });
    $('scoreboard').hidden = (screen !== 'roundScreen');
    document.body.classList.toggle('map-screen', screen === 'previewScreen' || screen === 'exploreScreen');
    // global settings button: available on every game / map screen
    const onMapScreen = (screen === 'roundScreen' || screen === 'exploreScreen' || screen === 'previewScreen');
    // Hide the button entirely for a quiz whose settings don't apply (Find/Name a continent).
    const s = settingsFor(S.mode);
    $('settingsBtn').hidden = !onMapScreen || (screen === 'roundScreen' && !s.region && !s.length);
    $('settingsPop').hidden = true;
    $('settingsBtn').setAttribute('aria-expanded', 'false');
    S.settingsDirty = false;
    window.scrollTo(0, 0);
  }

  // ---------- settings (region + length), shared by home and the global popover ----------
  function chipRow(container, items, type) {
    container.innerHTML = '';
    items.forEach((it) => {
      const active = type === 'region' ? regionActive(it.id) : it.id === S.length;
      const b = el('button', 'chip' + (active ? ' active' : ''), it.label);
      // Regions are multi-select (checkboxes); length stays single-select (radio).
      b.setAttribute('role', type === 'region' ? 'checkbox' : 'radio');
      b.setAttribute('aria-checked', active ? 'true' : 'false');
      b.dataset[type] = it.id;
      b.onclick = () => (type === 'region' ? toggleRegion(it.id) : applyLength(it.id));
      container.appendChild(b);
    });
  }

  // Reflect a setting change across every chip group on the page.
  function syncChips(type, id) {
    document.querySelectorAll(`[data-${type}]`).forEach((b) => {
      b.classList.toggle('active', b.dataset[type] === String(id));
    });
  }

  // ---- region selection (multi-select; empty Set = whole world) ----
  const REGION_IDS = REGIONS.filter((r) => r.id !== 'all').map((r) => r.id);
  const isAllRegions = () => S.regions.size === 0;
  const regionActive = (id) => (id === 'all' ? isAllRegions() : S.regions.has(id));

  function toggleRegion(id) {
    if (id === 'all') {
      S.regions.clear(); // "Whole world" = clear individual picks
    } else {
      if (S.regions.has(id)) S.regions.delete(id);
      else S.regions.add(id);
      if (S.regions.size >= REGION_IDS.length) S.regions.clear(); // all picked = whole world
    }
    syncRegionChips();
    updateAllCount(); // the "where" filter changes how many countries "all" is
    // Study maps refocus (to the one region if exactly one is picked); a running game restarts on close.
    const only = S.regions.size === 1 ? [...S.regions][0] : null;
    const focus = (m) => m && m.focusRegion(only);
    if (!$('previewScreen').hidden) focus(S.previewMap);
    else if (!$('exploreScreen').hidden) focus(S.exploreMap);
    else if (!$('roundScreen').hidden) S.settingsDirty = true;
  }

  // Region active-state depends on the whole Set, so it needs its own sync (not syncChips).
  function syncRegionChips() {
    document.querySelectorAll('[data-region]').forEach((b) => {
      const on = regionActive(b.dataset.region);
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function applyLength(id) {
    S.length = id;
    syncChips('length', id);
    if (!$('roundScreen').hidden) S.settingsDirty = true;
  }

  // Which of the two controls actually change THIS game? Region filters the country pool, so it's
  // moot for the continent set (a fixed 7) and the water games (filtered by type, not by region).
  // Length caps the queue, so it's moot only for the continent set (always all 7). A game with
  // neither gets no panel and no settings button at all. NB: "Match → Continents" is country-based
  // ("which continent is France in?"), so it keeps both — only Find/Name a continent has neither.
  function settingsFor(mode) {
    const continentSet = mode === 'find-continent' || mode === 'name-continent';
    const water = /^(find|name)-(water|ocean|river)$/.test(mode);
    const region = /^(find|name)-region$/.test(mode); // regions span the globe → no "where" filter, but length applies
    return { region: !continentSet && !water && !region, length: !continentSet };
  }

  // How many questions "Marathon · all" actually means for the current game (it varies by category,
  // and by the "where" filter for country games).
  function allCountFor(mode) {
    if (!mode) return ALL.length;
    if (mode === 'find-continent' || mode === 'name-continent') return CONTINENTS.length;
    if (mode === 'find-region') return REGIONS_ALL.length;
    if (mode === 'name-region') return REGIONS_STD.length;
    if (mode.indexOf('ocean') >= 0) return WATERS.filter((w) => OCEAN_TYPES.includes(w.type)).length;
    if (mode.indexOf('river') >= 0) return WATERS.filter((w) => RIVERLAKE_TYPES.includes(w.type)).length;
    return poolFor(mode).length; // country modes — respects the region ("where") filter
  }
  function updateAllCount() {
    const chip = document.querySelector('#setLengths [data-length="all"]');
    if (!chip) return;
    const n = $('roundScreen').hidden ? ALL.length : allCountFor(S.mode);
    chip.textContent = 'Marathon · ' + n;
  }

  function openSettings() {
    const onRound = !$('roundScreen').hidden;
    // On the round screen, show only the controls that matter for this game. On Explore/Preview
    // there's no quiz round, so "How many?" is meaningless — only the region focus applies.
    const s = onRound ? settingsFor(S.mode) : { region: true, length: false };
    if (onRound && !s.region && !s.length) return;
    $('setRegions').closest('.set-group').hidden = !s.region;
    $('setLengths').closest('.set-group').hidden = !s.length;
    updateAllCount(); // show the real "all" total for this game (e.g. Marathon · 34 for regions)
    $('setHint').hidden = !onRound; // only games restart on change
    $('settingsPop').hidden = false;
    $('settingsBtn').setAttribute('aria-expanded', 'true');
  }
  function closeSettings() {
    if ($('settingsPop').hidden) return;
    $('settingsPop').hidden = true;
    $('settingsBtn').setAttribute('aria-expanded', 'false');
    if (!$('roundScreen').hidden && S.settingsDirty) { S.settingsDirty = false; startRound(S.mode); }
  }
  const toggleSettings = () => ($('settingsPop').hidden ? openSettings() : closeSettings());

  // ---------- home ----------
  // A mosaic, not a list: one big card per CATEGORY (its element icon + the games you can play on it),
  // then a wide Explore card and a wide Mix card. Illustrations are the Plum Mascot element set.
  const UME = (name, cls) => `<img class="${cls || ''}" src="assets/ume/${name}.png" alt="" draggable="false">`;
  const HOME_CATS = [
    { id: 'countries',  tint: 'green',  size: 'big', sub: 'All 194 of them, from Andorra to Zimbabwe.', stat: () => `${ALL.length} countries` },
    { id: 'continents', tint: 'yellow', sub: 'Seven big pieces of the puzzle.', stat: () => `${CONTINENTS.length} continents` },
    { id: 'flags',      tint: 'pink',   sub: 'Stripes, stars and a maple leaf.', stat: () => `${ALL.length} flags` },
    { id: 'oceans',     tint: 'blue',   sub: 'Oceans, seas and gulfs.', stat: () => `${WATERS.filter((w) => OCEAN_TYPES.includes(w.type)).length} waters` },
    { id: 'rivers',     tint: 'teal',   sub: 'The Nile, the Amazon and the great lakes.', stat: () => `${WATERS.filter((w) => RIVERLAKE_TYPES.includes(w.type)).length} rivers & lakes` },
    { id: 'capitals',   tint: 'purple', sub: 'Which city runs the show?', stat: () => `${ALL.filter((c) => c.capital).length} capitals` },
    { id: 'regions',    tint: 'peach',  sub: 'Balkans, Sahel, Caribbean and more.', stat: () => `${(typeof REGIONS_ALL !== 'undefined' ? REGIONS_ALL : []).length} regions` },
  ];
  const GAME_VERB = { find: 'Find on map', name: 'Name it', match: 'Match' };

  function actionChip(label, onClick, cls) {
    const b = el('button', 'act' + (cls ? ' ' + cls : ''), label);
    b.type = 'button'; b.onclick = onClick; return b;
  }
  function catCard(c) {
    const card = el('section', `hcard tint-${c.tint}` + (c.size ? ' hcard-' + c.size : ''));
    card.innerHTML =
      `<div class="hcard-art">${UME('el-' + c.id)}</div>` +
      `<div class="hcard-body"><span class="hcard-stat">${c.stat()}</span>` +
      `<h2 class="hcard-title">${CAT_LABEL[c.id]}</h2><p class="hcard-sub">${c.sub}</p>` +
      `<div class="hcard-actions"></div></div>`;
    const acts = card.querySelector('.hcard-actions');
    GAMES.filter((g) => g.cats.includes(c.id)).forEach((g) =>
      acts.appendChild(actionChip(GAME_VERB[g.id], () => startCategory(g.id, c.id, { openSettings: true }))));
    if (EXPLORE_CATS.includes(c.id)) acts.appendChild(actionChip('Explore', () => openExplore(c.id), 'act-ghost'));
    return card;
  }
  function wideCard(cls, art, title, sub, actions) {
    const card = el('section', 'hcard hcard-wide ' + cls);
    card.innerHTML =
      `<div class="hcard-art">${UME(art)}</div>` +
      `<div class="hcard-body"><h2 class="hcard-title">${title}</h2><p class="hcard-sub">${sub}</p><div class="hcard-actions"></div></div>`;
    const acts = card.querySelector('.hcard-actions');
    actions.forEach(([label, fn, c]) => acts.appendChild(actionChip(label, fn, c)));
    return card;
  }

  function buildHome() {
    chipRow($('setRegions'), REGIONS, 'region');
    chipRow($('setLengths'), LENGTHS, 'length');
    const grid = $('modeGrid'); grid.innerHTML = '';
    HOME_CATS.forEach((c) => grid.appendChild(catCard(c)));
    grid.appendChild(wideCard('tint-purple hcard-explore', 'el-ume-explorer', 'Explore the atlas',
      'Roam freely, tap anything, read the facts. No score, no clock.',
      EXPLORE_CATS.map((cat) => [CAT_LABEL[cat], () => openExplore(cat), 'act-ghost'])));
    grid.appendChild(wideCard('tint-sun hcard-mix', 'el-ume-cards', 'Mix it up',
      'Finding, naming, flags and capitals — every kind of question, shuffled.',
      [['Surprise me', () => startCategory('mix', 'countries', { openSettings: true }), 'act-big']]));
    // Ume's greeting rotates each visit home
    const HELLO = ['Hi! Where shall we go today?', 'Ready? Pick a place!', 'I bet you can find Tuvalu.', 'One more round?', 'Flags or capitals today?'];
    const hb = $('homeBubble'); if (hb) hb.textContent = HELLO[Math.floor(Math.random() * HELLO.length)];
    $('countCount').textContent = `${ALL.length} countries · ${CONTINENTS.length} continents · ${WATERS.length} waters`;
  }

  // ---------- round flow ----------
  function poolFor(mode) {
    let pool = isAllRegions() ? ALL.slice() : ALL.filter((c) => S.regions.has(c.region));
    if (mode === 'capital' || mode === 'which-country' || mode === 'find-capital') pool = pool.filter((c) => c.capital);
    return pool;
  }

  const playableContinents = () => CONTINENTS.filter((c) => (CONTINENT_MEMBERS[c.key] || []).length);

  // Build a round's question queue. Each item: { mode, kind:'country'|'continent'|'water', country|continent|water }.
  function buildQueue(mode) {
    const take = (arr) => sample(arr, S.length === 'all' ? arr.length : Math.min(S.length, arr.length));
    if (mode === 'find-continent' || mode === 'name-continent') {
      return shuffle(CONTINENTS).map((continent) => ({ mode, kind: 'continent', continent })); // all 7, incl. Antarctica
    }
    if (mode === 'find-region' || mode === 'name-region') {
      // Find can use the famous informal regions too (Arabian Peninsula…); Name uses only the
      // standard subregions (each country has exactly one, so the answer is unambiguous).
      return take(mode === 'find-region' ? REGIONS_ALL : REGIONS_STD).map((region) => ({ mode, kind: 'region', region }));
    }
    if (/^(find|name)-(water|ocean|river)$/.test(mode)) {
      const find = mode.indexOf('find') === 0;
      const pool = mode.indexOf('ocean') >= 0 ? WATERS.filter((w) => OCEAN_TYPES.includes(w.type))
        : mode.indexOf('river') >= 0 ? WATERS.filter((w) => RIVERLAKE_TYPES.includes(w.type))
          : WATERS;
      return take(pool).map((water) => ({ mode: find ? 'find-water' : 'name-water', kind: 'water', water, pool }));
    }
    if (mode === 'find-all' || mode === 'name-all') {
      const find = mode === 'find-all';
      const items = [];
      poolFor('find-map').forEach((c) => items.push({ mode: find ? 'find-map' : 'name-country', kind: 'country', country: c }));
      poolFor('find-capital').forEach((c) => items.push({ mode: find ? 'find-capital' : 'capital', kind: 'country', country: c }));
      CONTINENTS.forEach((c) => items.push({ mode: find ? 'find-continent' : 'name-continent', kind: 'continent', continent: c }));
      WATERS.forEach((w) => items.push({ mode: find ? 'find-water' : 'name-water', kind: 'water', water: w }));
      return take(items);
    }
    // country modes (find-map, name-country, guess-flag, match-flag, capital, which-country, find-capital, mixed)
    return take(poolFor(mode)).map((country) => {
      let qmode = mode === 'mixed' ? SUBMODES[Math.floor(Math.random() * SUBMODES.length)] : mode;
      // Capitals game mixes BOTH directions: "find the country whose capital is X" (find-capital)
      // and the reverse "what is the capital of X?" (capital).
      if (mode === 'find-capital') qmode = Math.random() < 0.5 ? 'find-capital' : 'capital';
      if ((qmode === 'capital' || qmode === 'which-country' || qmode === 'find-capital') && !country.capital) qmode = 'guess-flag';
      return { mode: qmode, kind: 'country', country };
    });
  }

  function startRound(mode, opts = {}) {
    S.mode = mode;
    GQA.roundStart(mode);
    // Reshuffle the country palette for the finding games so colour can't be used as a clue.
    if (window.__gqRecolor && (/^find-(map|capital|flag|region)$/.test(mode) || mode === 'mixed')) window.__gqRecolor();
    S.index = 0; S.score = 0; S.streak = 0; S.misses = []; S.prox = [];
    S.mapFramed = false; // frame the map once at the start, then leave it to the user
    S.queue = buildQueue(mode);
    show('roundScreen');
    buildRoundModes();
    nextQuestion();
    // Greet a fresh game with the region/length panel open, so players discover it exists. It slips
    // away the moment they tap the map or the settings icon (the outside-click handler below closes it).
    if (opts.openSettings) openSettings();
  }

  function updateHud() {
    const total = S.queue.length;
    $('progressText').textContent = `${Math.min(S.index + 1, total)} / ${total}`;
    $('scoreText').textContent = S.score;
    $('streakText').textContent = S.streak;
    $('progressFill').style.width = `${(S.index / total) * 100}%`;
  }

  // Let the player drag the floating info sheet (full-window map only).
  function makeDraggable(el) {
    let active = false, sx, sy, bx, by;
    // Keep the panel within the viewport and cap its height to the space below it,
    // so however you move it, extra content scrolls (just like the default spot) — never cut.
    const fit = (ny) => { el.style.maxHeight = Math.max(140, window.innerHeight - ny - 14) + 'px'; };
    el.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.sheet-grip')) return; // drag only via the grip handle
      const r = el.getBoundingClientRect();
      el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
      fit(r.top);
      active = true; sx = e.clientX; sy = e.clientY; bx = r.left; by = r.top;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      const w = el.offsetWidth;
      let nx = bx + (e.clientX - sx), ny = by + (e.clientY - sy);
      nx = Math.max(16 - w + 90, Math.min(window.innerWidth - 90, nx));
      ny = Math.max(8, Math.min(window.innerHeight - 120, ny));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      fit(ny);
    });
    const end = (e) => { if (active) { active = false; el.classList.remove('dragging'); try { el.releasePointerCapture(e.pointerId); } catch (err) {} } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function resetStage() {
    S.answered = false;
    document.body.classList.remove('map-quiet', 'map-interactive', 'revealed');
    const dock = $('dock');
    dock.classList.remove('show', 'dragging');
    dock.style.left = dock.style.top = dock.style.right = dock.style.bottom = dock.style.transform = dock.style.maxHeight = '';
    $('dockOptions').hidden = false;
    $('dockOptions').innerHTML = '';
    $('roundCard').hidden = true;
    $('mediaSlot').hidden = true;
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    $('factcard').hidden = true;
    $('factcard').innerHTML = '';
    $('nextBtn').hidden = true;
    $('mapHint').textContent = '';
    // The answer reveal gently zooms to frame the country (frameCountries). Restore the view the
    // player had BEFORE that zoom so the next "Find …" question doesn't start zoomed into the last
    // answer — but their own panning/zooming still carries over (find-map "keeps your view").
    if (S.preReveal && S.roundMap) { try { S.roundMap.svg.call(S.roundMap.zoom.transform, S.preReveal); } catch (e) {} S.preReveal = null; }
  }

  function nextQuestion() {
    if (S.index >= S.queue.length) return endRound();
    resetStage();
    document.body.classList.add('full-map'); // every quiz question is full-screen
    updateHud();
    const q = S.queue[S.index];
    const render = RENDERERS[q.mode];
    render(q);
  }

  const showDock = () => $('dock').classList.add('show');

  function ensureRoundMap() {
    $('mapPanel').hidden = false;
    if (!S.roundMap) {
      S.roundMap = new window.GlobeMap($('map'), {
        showLabels: false,
        onPick: (pick) => onMapPick(pick),
      });
    } else {
      S.roundMap.clearStates();
      S.roundMap.resize();
    }
    applyQuizMapStyle(S.cat); // Explorer-style per-category map look
    return S.roundMap;
  }

  // ---- per-mode renderers ----
  // Every quiz mode is the same full-screen screen: a full-window map + floating
  // chrome (prompt/quit/score) + one frosted dock. Only the dock payload and the
  // map's role (interactive / glowing target / calm context) change per mode.
  const flagInline = (c) => `<img class="flag-inline" src="${flagSvg(c.iso2)}" data-iso="${c.iso2}" onerror="${onFlagError}">`;
  const PAD = { padTop: 84, padBottom: 232 }; // keep the framed country clear of the prompt + dock

  const RENDERERS = {
    'find-map': (q) => {
      document.body.classList.add('map-interactive');
      $('prompt').innerHTML = `Find${flagInline(q.country)}<b>${q.country.name}</b>`;
      const map = ensureRoundMap();
      map.setInteractive(true);
      requestAnimationFrame(() => {
        map.resize();
        // Frame once per round; afterwards keep the map exactly where the user left it.
        if (!S.mapFramed) {
          S.mapFramed = true;
          if (S.regions.size === 1) map.focusRegion([...S.regions][0]); else map.resetView();
        }
      });
      $('mapHint').textContent = 'Tap the country on the map.';
    },

    'name-country': (q) => {
      $('prompt').innerHTML = `Which country is <span class="glow-word">highlighted</span>?`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      // rAF can pause (backgrounded tab / dropped frame); the highlight is essential to this
      // question, so back it with a setTimeout (same pattern as name-continent/name-water).
      const settle = () => { map.resize(); map.highlight(q.country.iso3, { focus: true, instant: true, ...PAD }); };
      requestAnimationFrame(settle); setTimeout(settle, 60);
      renderTextOptions(shuffle([q.country, ...distractors(q.country, 3)]), (c) => c.name, q.country);
    },

    'guess-flag': (q) => {
      $('prompt').textContent = 'Whose flag is this?';
      $('mediaSlot').hidden = false;
      $('bigFlag').src = flagSvg(q.country.iso2);
      $('bigFlag').dataset.iso = q.country.iso2;
      $('bigFlag').setAttribute('onerror', onFlagError);
      const map = ensureRoundMap();
      map.setInteractive(false);
      requestAnimationFrame(() => { map.resize(); map.resetView(); });
      renderTextOptions(shuffle([q.country, ...distractors(q.country, 3)]), (c) => c.name, q.country);
    },

    'match-flag': (q) => {
      $('prompt').innerHTML = `Pick the flag of <b>${q.country.name}</b>`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      requestAnimationFrame(() => { map.resize(); map.resetView(); });
      const box = $('dockOptions'); box.className = 'options options-flags';
      shuffle([q.country, ...distractors(q.country, 3)]).forEach((c) => {
        const b = el('button', 'opt opt-flag');
        b.innerHTML = `<img src="${flagSvg(c.iso2)}" data-iso="${c.iso2}" alt="${c.name} flag" onerror="${onFlagError}">`;
        b.onclick = () => resolveChoice(b, c.iso3 === q.country.iso3, c, q);
        box.appendChild(b);
      });
      showDock();
    },

    'capital': (q) => {
      $('prompt').innerHTML = `What is the capital of${flagInline(q.country)}<b>${q.country.name}</b>?`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      const settle = () => { map.resize(); map.highlight(q.country.iso3, { focus: true, instant: true, soft: true, ...PAD }); };
      requestAnimationFrame(settle); setTimeout(settle, 60);
      const ds = distractors(q.country, 3, { capital: true });
      renderTextOptions(shuffle([q.country, ...ds]), (c) => c.capital, q.country);
    },

    'which-country': (q) => {
      $('prompt').innerHTML = `<b>${q.country.capital}</b> is the capital of…`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      requestAnimationFrame(() => { map.resize(); map.resetView(); });
      renderTextOptions(shuffle([q.country, ...distractors(q.country, 3)]), (c) => c.name, q.country);
    },

    'find-capital': (q) => {
      document.body.classList.add('map-interactive');
      $('prompt').innerHTML = `Find the country whose capital is <b>${q.country.capital}</b>`;
      const map = ensureRoundMap();
      map.setInteractive(true);
      requestAnimationFrame(() => {
        map.resize();
        if (!S.mapFramed) { S.mapFramed = true; if (S.regions.size === 1) map.focusRegion([...S.regions][0]); else map.resetView(); }
      });
      $('mapHint').textContent = 'Tap the country on the map.';
    },

    'find-continent': (q) => {
      document.body.classList.add('map-interactive');
      $('prompt').innerHTML = `Find <b>${q.continent.name}</b>`;
      const map = ensureRoundMap();
      map.setInteractive(true);
      setQuizContinentHover(true); // hovering a country lights up its whole continent
      requestAnimationFrame(() => { map.resize(); if (!S.mapFramed) { S.mapFramed = true; map.resetView(); } });
      $('mapHint').textContent = 'Tap the continent on the map.';
    },

    'name-continent': (q) => {
      $('prompt').innerHTML = `Which continent is <span class="glow-word">highlighted</span>?`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      // Grey out every continent and light up ONLY the target in solid blue, so the "highlighted"
      // one is unmistakable (the colored-continents backdrop washed the highlight out).
      map.setLandColoring((f) => 'country land-muted' + (f.country ? '' : ' is-territory'));
      map.setBordersHidden(false); map.setMarkersHidden(true); map.setHoverMode('off');
      const settle = () => { map.resize(); map.resetView(); highlightContinentOn(map, q.continent.key, 'is-target'); };
      requestAnimationFrame(settle); setTimeout(settle, 60);
      renderChoices(shuffle([q.continent, ...sample(CONTINENTS.filter((c) => c.key !== q.continent.key), 3)]), (c) => c.name, (c) => c.key === q.continent.key, q);
    },

    'find-region': (q) => {
      document.body.classList.add('map-interactive');
      $('prompt').innerHTML = `Find <b>${q.region.name}</b>`;
      const map = ensureRoundMap();
      map.setInteractive(true);
      setQuizRegionHover(true); // hovering a country lights up its whole subregion
      requestAnimationFrame(() => { map.resize(); if (!S.mapFramed) { S.mapFramed = true; map.resetView(); } });
      $('mapHint').textContent = 'Tap any country in this region.';
    },

    'name-region': (q) => {
      $('prompt').innerHTML = `Which region is <span class="glow-word">highlighted</span>?`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      map.setLandColoring((f) => 'country land-muted' + (f.country ? '' : ' is-territory'));
      map.setBordersHidden(false); map.setMarkersHidden(true); map.setHoverMode('off');
      const settle = () => { map.resize(); map.resetView(); highlightRegionOn(map, q.region, 'is-target'); };
      requestAnimationFrame(settle); setTimeout(settle, 60);
      renderChoices(shuffle([q.region, ...sample(REGIONS_STD.filter((r) => r.key !== q.region.key), 3)]), (r) => r.name, (r) => r.key === q.region.key, q);
    },

    'find-water': (q) => {
      document.body.classList.add('map-interactive');
      $('prompt').innerHTML = `Find the ${WATER_KIND[q.water.type] || 'water'}: <b>${q.water.name}</b>`;
      const map = ensureRoundMap();
      map.setInteractive(true);
      // Hover any water to see it light up; tap a water region to answer it (tapping open water
      // elsewhere falls back to the nearest water in this category).
      map.showWaterShapes(q.pool || WATERS,
        (w) => answerFindWater(w),
        (w, on) => { if (S.answered) return; if (on) map.showWaterArea(w.name, 'water-hover'); else map.clearWaterArea('water-hover'); });
      map.showWaterRest(q.pool || []); // always-on outlines for EVERY water so you can see where to hover — seas/oceans get a light-blue border (no fill, so no wash), rivers/lakes keep their own outline
      requestAnimationFrame(() => { map.resize(); if (!S.mapFramed) { S.mapFramed = true; map.resetView(); } });
      $('mapHint').textContent = 'Tap where it is on the map.';
    },

    'name-water': (q) => {
      $('prompt').innerHTML = `Which water body is marked?`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      const settle = () => { map.resize(); map.resetView(); map.markAsk(q.water.latlng); };
      requestAnimationFrame(settle); setTimeout(settle, 60);
      const pool = q.pool || WATERS;
      renderChoices(shuffle([q.water, ...sample(pool.filter((w) => w.name !== q.water.name), 3)]), (w) => w.name, (w) => w.name === q.water.name, q);
    },

    // Find on Map → Flags: show a flag, you find the country on the map.
    'find-flag': (q) => {
      document.body.classList.add('map-interactive');
      $('prompt').innerHTML = `Find this country: <img class="prompt-flag" src="${flagSvg(q.country.iso2)}" data-iso="${q.country.iso2}" alt="flag" onerror="${onFlagError}">`;
      const map = ensureRoundMap();
      map.setInteractive(true);
      requestAnimationFrame(() => {
        map.resize();
        if (!S.mapFramed) { S.mapFramed = true; if (S.regions.size === 1) map.focusRegion([...S.regions][0]); else map.resetView(); }
      });
      $('mapHint').textContent = 'Tap the country on the map.';
    },

    // Match → Continents: which continent does this country belong to?
    'match-continent': (q) => {
      $('prompt').innerHTML = `Which continent is${flagInline(q.country)}<b>${q.country.name}</b> in?`;
      const map = ensureRoundMap();
      map.setInteractive(false);
      const settle = () => { map.resize(); map.highlight(q.country.iso3, { focus: true, instant: true, ...PAD }); };
      requestAnimationFrame(settle); setTimeout(settle, 60);
      const key = continentKeyOf(q.country);
      const correct = CONTINENTS.find((c) => c.key === key);
      const opts = correct ? shuffle([correct, ...sample(CONTINENTS.filter((c) => c.key !== key), 3)]) : shuffle(sample(CONTINENTS, 4));
      renderChoices(opts, (c) => c.name, (c) => c.key === key, q);
    },
  };

  // Render the 4 multiple-choice buttons into the dock.
  function renderTextOptions(opts, labelFn, answer) {
    const box = $('dockOptions'); box.className = 'options options-text';
    opts.forEach((c, i) => {
      const b = el('button', 'opt', `<span class="opt-key">${i + 1}</span>${labelFn(c)}`);
      b.onclick = () => resolveChoice(b, c.iso3 === answer.iso3, c, S.queue[S.index]);
      box.appendChild(b);
    });
    showDock();
  }

  // Multiple-choice for non-country objects (continents, waters).
  function renderChoices(opts, labelFn, isCorrect, q) {
    const box = $('dockOptions'); box.className = 'options options-text';
    opts.forEach((o, i) => {
      const b = el('button', 'opt', `<span class="opt-key">${i + 1}</span>${labelFn(o)}`);
      b.onclick = () => resolveGeneric(b, !!isCorrect(o), o, labelFn, q);
      box.appendChild(b);
    });
    showDock();
  }

  function correctLabelText(q) {
    if (q.mode === 'match-continent') { const c = CONTINENTS.find((x) => x.key === continentKeyOf(q.country)); return c ? c.name : ''; }
    if (q.kind === 'continent') return q.continent.name;
    if (q.kind === 'region') return q.region.name;
    if (q.kind === 'water') return q.water.name;
    return q.mode === 'capital' ? q.country.capital : q.country.name;
  }

  function resolveGeneric(btn, correct, picked, labelFn, q) {
    if (S.answered) return;
    const box = btn.parentElement;
    [...box.children].forEach((b) => { b.disabled = true; });
    btn.classList.add(correct ? 'correct' : 'wrong');
    if (!correct) {
      const cl = correctLabelText(q);
      [...box.children].forEach((b) => { if (b.textContent.replace(/^\d+/, '').trim() === cl) b.classList.add('correct'); });
    }
    const map = S.roundMap;
    if (q.kind === 'continent' && map) {
      highlightContinentOn(map, q.continent.key, 'flash-correct'); // whole correct continent green
      const tags = [{ latlng: q.continent.latlng, label: q.continent.name, kind: 'correct' }];
      if (!correct && picked && picked.key) { // whole wrongly-picked continent red
        highlightContinentOn(map, picked.key, 'flash-wrong', true);
        tags.push({ latlng: picked.latlng, label: picked.name, kind: 'wrong' });
      }
      map.showTags(tags);
    } else if (q.kind === 'water' && map) {
      const states = [{ name: q.water.name, kind: 'correct' }];
      const tags = [{ latlng: q.water.latlng, label: q.water.name, kind: 'correct' }];
      if (!correct && picked && picked.name) { states.push({ name: picked.name, kind: 'wrong' }); tags.push({ latlng: picked.latlng, label: picked.name, kind: 'wrong' }); }
      map.showWaterStates(states);
      map.showTags(tags);
    }
    finishAnswer(correct, q, correct ? '' : labelFn(picked));
  }

  // Nearest water body (by rough lat/lon distance) to a clicked point — for Find-the-water.
  // Scoped to `pool` (the quiz's category) so a rivers round resolves to the nearest river/lake,
  // not an ocean that happens to be closer.
  function nearestWater(lat, lon, pool) {
    let best = null, bd = Infinity;
    (pool && pool.length ? pool : WATERS).forEach((w) => {
      const dlat = w.latlng[0] - lat;
      const dlon = (w.latlng[1] - lon) * Math.cos((lat + w.latlng[0]) / 2 * Math.PI / 180);
      const d = dlat * dlat + dlon * dlon;
      if (d < bd) { bd = d; best = w; }
    });
    return best;
  }

  // ---- answering ----
  // Reveal the answer ON THE MAP in every mode (the "oh, that's where it is" moment):
  // the correct country flashes green, a wrong pick flashes red; zoom out only if needed.
  function revealOnMap(correctCountry, picked, correct) {
    const map = S.roundMap;
    if (!map) return;
    const correctIso = correctCountry.iso3;
    map.flash(correctIso, true);
    const wrong = (!correct && picked && picked.iso3 && picked.iso3 !== correctIso) ? picked : null;
    if (wrong) map.flash(wrong.iso3, false);
    // Name tags so you can read both countries straight off the map.
    const tags = [{ iso3: correctIso, label: correctCountry.name, kind: 'correct' }];
    if (wrong) tags.push({ iso3: wrong.iso3, label: wrong.name, kind: 'wrong' });
    map.showTags(tags);
    // Remember the player's current view, then gently frame the revealed countries so both the
    // right and the wrong one are well defined. The pre-reveal view is restored on the next question.
    try { S.preReveal = d3.zoomTransform(map.svg.node()); } catch (e) { S.preReveal = null; }
    map.frameCountries(wrong ? [correctIso, wrong.iso3] : [correctIso]);
  }

  // Resolve a find-the-water answer (from tapping a water region OR the nearest water to a tap).
  function answerFindWater(picked) {
    const q = S.queue[S.index];
    if (!q || S.answered || q.mode !== 'find-water') return;
    const map = S.roundMap;
    const correct = !!picked && picked.name === q.water.name;
    const prox = proxFor(correct, picked && picked.latlng ? picked.latlng[0] : null, picked && picked.latlng ? picked.latlng[1] : null, q.water.latlng);
    map.setInteractive(false);
    const tags = [{ latlng: q.water.latlng, label: q.water.name, kind: 'correct' }];
    const states = [{ name: q.water.name, kind: 'correct' }]; // showWaterStates skips globe-spanning oceans (tag only)
    if (!correct && picked) { tags.push({ latlng: picked.latlng, label: picked.name, kind: 'wrong' }); states.push({ name: picked.name, kind: 'wrong' }); }
    map.clearWaterArea(); map.showWaterStates(states); map.showTags(tags);
    $('mapHint').textContent = '';
    finishAnswer(correct, q, correct ? '' : (picked ? picked.name : ''), prox);
  }

  // ---- proximity scoring (find-on-map): reward tapping CLOSE even when it's the wrong answer ----
  // Great-circle distance (km) between two [lat,lon] points.
  function haversineKm(aLat, aLon, bLat, bLon) {
    const R = 6371, r = (d) => (d * Math.PI) / 180;
    const dLat = r(bLat - aLat), dLon = r(bLon - aLon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // 0–100 "how close" from a distance: 100 at the spot, ~76% one island over (~700 km), fading to 0
  // across the world. A wrong-but-nearby tap still scores high — it "almost" counts.
  const proxPct = (km) => Math.max(0, Math.round(100 * Math.exp(-km / 2500)));
  // Build the per-answer proximity record for a map tap. correct => a perfect 100.
  function proxFor(correct, gLat, gLon, correctLL) {
    if (correct) return { pct: 100, km: 0 };
    if (gLat == null || gLon == null || !correctLL) return null;
    const km = haversineKm(gLat, gLon, correctLL[0], correctLL[1]);
    return { pct: proxPct(km), km: Math.round(km) };
  }

  function onMapPick(pick) {
    const q = S.queue[S.index];
    if (!q || S.answered) return;
    const map = S.roundMap;
    if (q.mode === 'find-map' || q.mode === 'find-capital' || q.mode === 'find-flag') {
      if (!pick.isCountry) { $('mapHint').textContent = `That's ${pick.name} — keep looking.`; return; }
      const correct = pick.iso3 === q.country.iso3;
      const gLat = pick.lat != null ? pick.lat : (pick.country ? pick.country.latlng[0] : null);
      const gLon = pick.lon != null ? pick.lon : (pick.country ? pick.country.latlng[1] : null);
      const prox = proxFor(correct, gLat, gLon, q.country.latlng);
      map.setInteractive(false);
      revealOnMap(q.country, pick.country, correct);
      $('mapHint').textContent = '';
      finishAnswer(correct, q, correct ? '' : pick.country.name, prox);
    } else if (q.mode === 'find-continent') {
      const pickedKey = continentKeyOfPick(pick); // country's continent, OR a territory/Antarctica landmass
      if (!pickedKey) { $('mapHint').textContent = 'Tap a landmass.'; return; }
      const correct = pickedKey === q.continent.key;
      map.setInteractive(false);
      // Flash the WHOLE correct continent green; if wrong, flash the WHOLE picked continent red too.
      highlightContinentOn(map, q.continent.key, 'flash-correct');
      const tags = [{ latlng: q.continent.latlng, label: q.continent.name, kind: 'correct' }];
      const cont = CONTINENTS.find((c) => c.key === pickedKey);
      if (!correct) {
        highlightContinentOn(map, pickedKey, 'flash-wrong', true); // whole picked continent red, keep the green
        if (cont) tags.push({ latlng: cont.latlng, label: cont.name, kind: 'wrong' });
      }
      map.showTags(tags);
      $('mapHint').textContent = '';
      finishAnswer(correct, q, correct ? '' : (cont ? cont.name : pick.country.name));
    } else if (q.mode === 'find-region') {
      if (!pick.isCountry) { $('mapHint').textContent = 'Tap a country in the region.'; return; }
      const inTarget = q.region.members.some((c) => c.iso3 === pick.iso3);
      map.setInteractive(false);
      highlightRegionOn(map, q.region, 'flash-correct'); // whole target region green
      const tags = [{ latlng: q.region.latlng, label: q.region.name, kind: 'correct' }];
      let wrongName = '';
      if (!inTarget) {
        // Flash the WHOLE region the tapped country belongs to red (not just that one country),
        // minus any overlap with the correct region so nothing is both red and green.
        const wrongRegion = REGION_BY_KEY[regionKeyOf(pick.country)];
        if (wrongRegion) {
          const rightSet = new Set(q.region.members.map((c) => c.iso3));
          map.highlightSet(wrongRegion.members.filter((c) => !rightSet.has(c.iso3)).map((c) => c.iso3), 'flash-wrong', true);
          tags.push({ latlng: wrongRegion.latlng, label: wrongRegion.name, kind: 'wrong' });
          wrongName = wrongRegion.name;
        } else { // fallback (shouldn't happen — every country has a subregion)
          map.highlightSet([pick.iso3], 'flash-wrong', true);
          tags.push({ iso3: pick.iso3, label: pick.country.name, kind: 'wrong' });
          wrongName = pick.country.name;
        }
      }
      map.showTags(tags);
      $('mapHint').textContent = '';
      finishAnswer(inTarget, q, wrongName);
    } else if (q.mode === 'find-water') {
      // Tapping a water REGION answers it directly (handled by showWaterShapes). Tapping open water
      // elsewhere resolves to the nearest water in this round's category — so a land-locked sea is
      // still findable, and tapping a country never selects the country (only waters are valid).
      if (pick.lat == null || pick.lon == null) { $('mapHint').textContent = 'Tap where it is on the map.'; return; }
      answerFindWater(nearestWater(pick.lat, pick.lon, q.pool));
    }
  }

  function resolveChoice(btn, correct, picked, q) {
    if (S.answered) return;
    const box = btn.parentElement;
    [...box.children].forEach((b) => { b.disabled = true; });
    btn.classList.add(correct ? 'correct' : 'wrong');
    if (!correct) markCorrectOption(box, q);
    revealOnMap(q.country, picked, correct);
    finishAnswer(correct, q, correct ? '' : (q.mode === 'capital' ? picked.capital : picked.name));
  }

  function markCorrectOption(box, q) {
    // For text options match by capital or name; for flags match by iso (via img src).
    [...box.children].forEach((b) => {
      const img = b.querySelector('img');
      if (img && img.dataset.iso === q.country.iso2) b.classList.add('correct');
      else if (!img) {
        const t = b.textContent.replace(/^\d+/, '').trim();
        if (t === q.country.name || t === q.country.capital) b.classList.add('correct');
      }
    });
  }

  // wrongLabel: the name of what the player wrongly picked ('' if correct or unknown).
  // prox: {pct, km} proximity of a map tap to the right answer (null for non-map questions).
  function finishAnswer(correct, q, wrongLabel, prox) {
    S.answered = true;
    const id = q.kind === 'continent' ? q.continent.key : q.kind === 'region' ? q.region.key : q.kind === 'water' ? q.water.name : q.country.iso3;
    GQA.answer(q.mode, id, correct);
    if (correct) { S.score++; S.streak++; burst(); } else { S.streak = 0; if (q.kind === 'country') S.misses.push(q.country); }
    if (prox) S.prox.push(prox.pct); // track proximity for the round's "how close" average
    $('scoreText').textContent = S.score;
    $('streakText').textContent = S.streak;
    const fb = $('feedback');
    fb.className = 'feedback ' + (correct ? 'ok' : 'no');
    const cl = correctLabelText(q);
    // Ume reacts: celebrating for a hit, determined ("next one!") for a miss.
    fb.innerHTML = UME(correct ? '2d-celebrating' : '2d-determined', 'fb-ume') + '<div class="fb-text"><div class="fb-msg">' + (correct
      ? praise()
      : wrongLabel
        ? `You picked <b>${wrongLabel}</b>. It's <b>${cl}</b>.`
        : `It's <b>${cl}</b>.`) + '</div></div>';
    // Near-miss readout: a wrong-but-close tap still earns a high proximity — it "almost" counts.
    if (prox && !correct) {
      const phrase = prox.pct >= 85 ? 'so close!' : prox.pct >= 60 ? 'close!' : prox.pct >= 35 ? 'getting warmer' : 'quite far';
      fb.querySelector('.fb-text').innerHTML += `<div class="fb-prox"><span class="fb-pill"><b>${prox.pct}%</b> close</span><span class="fb-pill">~${prox.km.toLocaleString()} km away</span><span class="fb-phrase">${phrase}</span></div>`;
    }
    showFact(q);
    // Reveal in the Explorer-style card on the right (one info panel, like Explore). The map
    // already flashes the correct/wrong answer, so the choice dock retires for the reveal.
    document.body.classList.add('revealed');
    $('dock').classList.remove('show');
    $('roundCard').hidden = false;
    const nb = $('nextBtn');
    nb.hidden = false;
    const last = (S.index + 1 >= S.queue.length);
    nb.innerHTML = (last ? 'See results' : 'Next') + ICON('chevron-right');
    nb.focus();
  }

  // Fact card per object kind.
  function showFact(q) {
    if (q.kind === 'continent') return showContinentFact(q.continent);
    if (q.kind === 'region') return showRegionFact(q.region);
    if (q.kind === 'water') return showWaterFact(q.water);
    return showFactCard(q.country);
  }
  function showRegionFact(r) {
    const card = $('factcard');
    const names = r.members.map((c) => c.name).sort().join(' · ');
    card.innerHTML = `
      <div class="fc-head"><span class="fc-emoji">${UME('el-regions')}</span>
        <div class="fc-title"><div class="fc-name">${r.name}</div><div class="fc-sub">Region · ${r.members.length} countries</div></div></div>
      <div class="fc-regionlist">${names}</div>
      ${r.fact ? `<div class="fc-fact">${ICON('bulb')} <span><b>Did you know?</b> ${r.fact}</span></div>` : ''}`;
    card.hidden = false;
  }
  function showContinentFact(cont) {
    const card = $('factcard');
    card.innerHTML = `
      <div class="fc-head"><span class="fc-emoji">${UME('el-continents')}</span>
        <div class="fc-title"><div class="fc-name">${cont.name}</div><div class="fc-sub">Continent</div></div></div>
      <div class="fc-chips">${chipHtml([['maximize', cont.area], ['globe', cont.population], ['flag', `${cont.countries} countries`]])}</div>
      <div class="fc-fact">${ICON('bulb')} <span><b>Did you know?</b> ${cont.fact}</span></div>`;
    card.hidden = false;
  }
  function showWaterFact(w) {
    const card = $('factcard');
    card.innerHTML = `
      <div class="fc-head"><span class="fc-emoji">${UME(RIVERLAKE_TYPES.includes(w.type) ? 'el-rivers' : 'el-oceans')}</span>
        <div class="fc-title"><div class="fc-name">${w.name}</div><div class="fc-sub">${WATER_KIND[w.type] || ''}</div></div></div>
      <div class="fc-chips">${chipHtml([['tag', WATER_KIND[w.type] || 'Water'], ['maximize', w.stat]].filter((c) => c[1]))}</div>
      <div class="fc-fact">${ICON('bulb')} <span><b>Did you know?</b> ${w.fact}</span></div>`;
    card.hidden = false;
  }

  const PRAISE = ['Nice!', 'Spot on!', 'Yes!', 'Brilliant!', 'You got it!', 'Correct!', 'Sharp!'];
  const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

  // ---- fact card ----
  function structuredChips(c) {
    const chips = [];
    if (c.capital) chips.push(['landmark', `Capital: ${c.capital}`]);
    if (c.subregion) chips.push(['map', c.subregion]);
    if (c.languages && c.languages.length) chips.push(['message', c.languages.slice(0, 3).join(', ')]);
    if (c.currencies && c.currencies.length) chips.push(['coin', c.currencies[0]]);
    chips.push([c.landlocked ? 'mountain' : 'waves', c.landlocked ? 'Landlocked' : 'Has a coastline']);
    if (c.neighbors && c.neighbors.length) chips.push(['share', `Borders ${c.neighbors.length} countr${c.neighbors.length > 1 ? 'ies' : 'y'}`]);
    else chips.push(['share', 'No land borders']);
    if (c.area) chips.push(['maximize', `${Math.round(c.area).toLocaleString()} km²`]);
    return chips;
  }

  const chipHtml = (chips) => chips.map(([i, t]) => `<span class="chip-fact">${ICON(i)}${t}</span>`).join('');

  function showFactCard(c, correct) {
    const card = $('factcard');
    const fact = (c.facts && c.facts.length) ? c.facts[Math.floor(Math.random() * c.facts.length)] : '';
    card.innerHTML = `
      <div class="fc-head">
        <img class="fc-flag" src="${flagSvg(c.iso2)}" data-iso="${c.iso2}" alt="${c.name} flag" onerror="${onFlagError}">
        <div class="fc-title">
          <div class="fc-name">${c.name}</div>
          <div class="fc-sub">${c.capital ? c.capital + ' · ' : ''}${c.region}</div>
        </div>
      </div>
      <div class="fc-chips">${chipHtml(structuredChips(c))}</div>
      ${fact ? `<div class="fc-fact">${ICON('bulb')} <span><b>Did you know?</b> ${fact}</span></div>` : ''}`;
    card.hidden = false;
  }

  // ---- results ----
  function endRound() {
    const total = S.queue.length;
    const pct = total ? Math.round((S.score / total) * 100) : 0;
    GQA.roundComplete(S.mode, S.score);
    show('resultsScreen');
    $('resultsEmoji').innerHTML = UME(pct >= 90 ? '3d-celebrating' : pct >= 70 ? '3d-happy' : pct >= 50 ? '3d-playful' : '3d-determined');
    $('resultsTitle').textContent = pct >= 90 ? 'Geography star!' : pct >= 70 ? 'Great going!' : pct >= 50 ? 'Nice progress!' : 'Every round teaches you more';
    $('resultsScore').innerHTML = `<b>${S.score}</b> / ${total} &nbsp;·&nbsp; ${pct}%`;
    $('resultsBars').innerHTML = `<div class="rbar"><div class="rbar-fill" style="width:${pct}%"></div></div>`;
    // Proximity metric — how close your map taps landed on average (100 for exact hits, high for
    // near-misses). Only shown when the round actually had find-on-map questions.
    if (S.prox && S.prox.length) {
      const avgProx = Math.round(S.prox.reduce((a, b) => a + b, 0) / S.prox.length);
      $('resultsBars').innerHTML += `<div class="results-prox">🎯 <b>${avgProx}%</b> average proximity` +
        `<span class="rp-sub">how close your taps landed — near-misses count</span>` +
        `<div class="rbar rbar-prox"><div class="rbar-fill" style="width:${avgProx}%"></div></div></div>`;
    }
    const review = $('review'), list = $('reviewList');
    if (S.misses.length) {
      review.hidden = false;
      list.innerHTML = '';
      [...new Map(S.misses.map((c) => [c.iso3, c])).values()].forEach((c) => {
        const item = el('button', 'review-item');
        item.innerHTML = `<img src="${flagSvg(c.iso2)}" data-iso="${c.iso2}" alt="" onerror="${onFlagError}"><span><b>${c.name}</b><br>${c.capital || ''}</span>`;
        item.onclick = () => openExplore(c);
        list.appendChild(item);
      });
    } else {
      review.hidden = true;
    }
    if (pct >= 70) bigBurst();
  }

  // ---------- explore / atlas ----------
  // openExplore('countries'|'continents'|'waters') OR openExplore(countryObj) to focus a country.
  function openExplore(arg) {
    let mode = 'countries', focusCountry = null;
    if (typeof arg === 'string') mode = arg;
    else if (arg && arg.iso3) focusCountry = arg;
    show('exploreScreen');
    if (!S.exploreMap) {
      S.exploreMap = new window.GlobeMap($('exploreMap'), {
        showLabels: true,
        onHover: () => {},
        onPick: (pick) => {
          if (S.exploreMode === 'continents') {
            const k = continentKeyOfPick(pick); // country OR territory (Greenland, Antarctica, …)
            if (k) showContinent(k); else deselectExplore(); // clicked empty ocean / non-continent territory
            return;
          }
          if (S.exploreMode === 'regions') {
            const k = pick.country ? regionKeyOf(pick.country) : null;
            if (k) showRegion(k); else deselectExplore();
            return;
          }
          if (S.exploreMode === 'oceans' || S.exploreMode === 'rivers') {
            deselectExplore(); // water is selected via its label; clicking the map clears
            return;
          }
          if (pick.country) showAtlas(pick.country);
          else deselectExplore(); // clicked empty water / non-country territory → clear selection
        },
      });
    }
    S.exploreMap.resize();
    S.exploreMap.setInteractive(true);
    buildExploreModes();
    if (focusCountry) { setExploreMode('countries'); showAtlas(focusCountry); S.exploreMap.highlight(focusCountry.iso3, { focus: true }); }
    else setExploreMode(mode);
  }

  function buildExploreModes() {
    const box = $('exploreModes');
    if (!box || box.children.length) return; // build once
    EXPLORE_CATS.forEach((id) => {
      const b = el('button', 'chip', CAT_LABEL[id]);
      b.setAttribute('role', 'radio'); b.dataset.exmode = id;
      b.onclick = () => setExploreMode(id);
      box.appendChild(b);
    });
  }

  // Hover the WHOLE continent (from the country area OR the continent name — same effect).
  // Hover = highlight ONLY (lighter territory + dark-blue name pill); the info card is shown on
  // CLICK, not hover. On leave, restore the selected continent's darker highlight (it persists).
  function hoverContinent(key, on) {
    const map = S.exploreMap; if (!map) return;
    if (on && key) {
      highlightContinentOn(map, key, 'is-soft'); // hover = lighter (members + territories)
      // re-assert the selected continent's darker highlight if we're hovering a DIFFERENT one
      if (S.selContinent && S.selContinent !== key) highlightContinentOn(map, S.selContinent, 'is-target', true);
      map.gPlaces.selectAll('g.place').classed('is-hovered', (d) => d.key === key);
    } else {
      map.clearStates();
      map.gPlaces.selectAll('g.place').classed('is-hovered', false);
      if (S.selContinent) { highlightContinentOn(map, S.selContinent, 'is-target'); markSelPlace((d) => d.key === S.selContinent); } // restore the darker selected
    }
  }
  // Mark exactly one place pill as the selected (dark-blue) one; clears it from the rest.
  function markSelPlace(matchFn) {
    const map = S.exploreMap; if (!map) return;
    map.gPlaces.selectAll('g.place').classed('is-sel', (d) => !!(matchFn && matchFn(d)));
  }
  // Water hover (from the AREA or the name): light up BOTH the water shape (lighter) and its
  // name pill (dark blue). On leave, restore the selected water (darker) + its pill.
  // A water's fill is drawn by showWaterArea only if it isn't globe-spanning (the map decides by
  // size); the 5 huge oceans skip the fill automatically and are shown by their name pill/tag.
  function hoverWater(w, on) {
    const map = S.exploreMap; if (!map) return;
    if (on && w && w.name !== S.selWater) { // don't draw a hover layer over the already-selected water
      map.showWaterArea(w.name, 'water-hover');
      map.gPlaces.selectAll('g.place').classed('is-hovered', (d) => d.name === w.name);
    } else {
      map.gPlaces.selectAll('g.place').classed('is-hovered', false);
      map.clearWaterArea('water-hover'); // remove ONLY the transient hover — the selected stays lit
    }
  }

  // Attach/detach our own continent-area hover to the land paths (map's built-in hover is off).
  function setContinentAreaHover(on) {
    const map = S.exploreMap; if (!map) return;
    const sel = map.gLand.selectAll('path');
    if (on) {
      sel.on('mouseenter.ex', (e, f) => { const k = f.country ? continentKeyOf(f.country) : (TERRITORY_CONT[f.displayName] || null); if (k) hoverContinent(k, true); })
        .on('mouseleave.ex', () => hoverContinent(null, false));
    } else {
      sel.on('mouseenter.ex', null).on('mouseleave.ex', null);
    }
  }

  function setExploreMode(mode) {
    S.exploreMode = mode; S.selContinent = null; S.selWater = null; S.selRegion = null;
    document.querySelectorAll('#exploreModes [data-exmode]').forEach((b) => b.classList.toggle('active', b.dataset.exmode === mode));
    const map = S.exploreMap;
    map.clearPlaces(); map.clearStates(); map.setLabels(false); map.clearWaterArea(); map.clearWaterShapes();
    map.setLandColoring(null); map.setBordersHidden(false);
    map.setShowAllLabels(false); map.setMarkersHidden(false); map.setHoverMode('country');
    setContinentAreaHover(false); setRegionAreaHover(false);
    $('atlasCard').classList.remove('shown');
    $('searchResults').hidden = true;
    const sw = document.querySelector('#exploreScreen .search-wrap');
    if (sw) sw.style.display = mode === 'countries' ? '' : 'none';
    if (mode === 'countries') {
      // Paint the atlas with the SAME vivid, VARIED palette the Find games use. The load-time greedy
      // colouring clusters the warm colours (a sea of salmon/orange) and reads pale — reshuffle it,
      // then re-apply the fresh colours to both the land AND the microstate dots.
      if (window.__gqRecolor) window.__gqRecolor();
      map.setLandColoring(null);
      map.gMarks.selectAll('circle').each(function (c) { for (let i = 0; i < 8; i++) this.classList.remove('c' + i); this.classList.add('c' + c._color); });
      // Show EVERY country name at once (not progressive) — they shrink/grow with zoom.
      map.setLabels(true); map.setShowAllLabels(true);
      $('exploreHint').textContent = 'Every country is named — tap any one (or search) to read about it.';
    } else if (mode === 'continents') {
      // Continents only: colour each country by its continent, drop internal borders, hide dots.
      map.setLandColoring(continentLandColoring());
      map.setBordersHidden(true); map.setMarkersHidden(true); map.setHoverMode('off');
      map.showPlaces(CONTINENTS, (d) => showContinent(d.key), (d, on) => hoverContinent(d.key, on));
      setContinentAreaHover(true);
      $('exploreHint').textContent = 'Hover or tap a continent to highlight the whole continent.';
    } else if (mode === 'regions') {
      // Countries keep their colours; hovering any country lights up its whole region + names it.
      map.setBordersHidden(false); map.setMarkersHidden(true); map.setHoverMode('off');
      map.showPlaces(REGIONS_STD, (d) => showRegion(d.key), (d, on) => hoverRegion(d.key, on));
      setRegionAreaHover(true);
      $('exploreHint').textContent = 'Hover or tap a country to light up its whole region.';
    } else if (mode === 'oceans') {
      // Continents stay in colour with their names (as a non-interactive backdrop); only oceans
      // are hoverable/clickable.
      map.setLandColoring(continentLandColoring());
      map.setBordersHidden(true); map.setMarkersHidden(true); map.setHoverMode('off');
      const oceanWaters = WATERS.filter((w) => OCEAN_TYPES.includes(w.type));
      const places = CONTINENTS.map((c) => Object.assign({ _static: true }, c))
        .concat(oceanWaters.map((w) => Object.assign({ _cat: 'water' }, w)));
      map.showPlaces(places, (d) => { if (d._cat === 'water') showWater(d); }, (d, on) => { if (d._cat === 'water') hoverWater(d, on); });
      map.showWaterShapes(oceanWaters, (d) => showWater(d), (d, on) => hoverWater(d, on)); // hover/click the AREA too
      map.showWaterRest(oceanWaters); // always-on light-blue borders so you can see each ocean/sea's extent
      $('exploreHint').textContent = 'Hover or tap an ocean, sea or gulf.';
    } else if (mode === 'rivers') {
      // Water only: muted land, no dots, hovering a country does nothing — only water lights up.
      map.setLandColoring((f) => 'country land-muted' + (f.country ? '' : ' is-territory'));
      map.setMarkersHidden(true); map.setHoverMode('off');
      const riverWaters = WATERS.filter((w) => RIVERLAKE_TYPES.includes(w.type));
      map.showPlaces(riverWaters, (d) => showWater(d), (d, on) => hoverWater(d, on));
      map.showWaterShapes(riverWaters, (d) => showWater(d), (d, on) => hoverWater(d, on)); // hover/click the AREA too
      map.showWaterRest(riverWaters); // faint outlines so every river/lake is visible at rest
      $('exploreHint').textContent = 'Hover or tap a river or lake.';
    }
  }

  // Fill the info panel with a continent's facts (no selection change — used on hover AND click).
  function renderContinentCard(key) {
    const cont = CONTINENTS.find((c) => c.key === key);
    if (!cont) return;
    const members = CONTINENT_MEMBERS[key] || [];
    const card = $('atlasCard'); card.classList.add('shown');
    const chips = chipHtml([['maximize', cont.area], ['globe', cont.population], ['flag', `${cont.countries} countr${cont.countries === '1' ? 'y' : 'ies'}`]]);
    card.innerHTML = `
      <div class="atlas-head">
        <span class="place-emoji">${ICON('map')}</span>
        <div><div class="atlas-name">${cont.name}</div><div class="atlas-official">Continent · ${members.length} on the map</div></div>
      </div>
      <div class="fc-chips">${chips}</div>
      <div class="atlas-facts"><div class="fc-fact">${ICON('bulb')} <span>${cont.fact}</span></div></div>`;
  }

  function showContinent(key) {
    const cont = CONTINENTS.find((c) => c.key === key);
    if (!cont) return;
    S.selContinent = key; S.selWater = null; S.selRegion = null;
    highlightContinentOn(S.exploreMap, key, 'is-target'); // selected = darker (members + territories)
    markSelPlace((d) => d.key === key); // the continent's name pill = dark blue (selected)
    renderContinentCard(key);
  }

  // ----- Explore: regions (mirror of the continent hover/select/card, keyed by region) -----
  function hoverRegion(key, on) {
    const map = S.exploreMap; if (!map) return;
    if (on && key) {
      highlightRegionOn(map, REGION_BY_KEY[key], 'is-soft');
      if (S.selRegion && S.selRegion !== key) highlightRegionOn(map, REGION_BY_KEY[S.selRegion], 'is-target', true);
      map.gPlaces.selectAll('g.place').classed('is-hovered', (d) => d.key === key);
    } else {
      map.clearStates();
      map.gPlaces.selectAll('g.place').classed('is-hovered', false);
      if (S.selRegion) { highlightRegionOn(map, REGION_BY_KEY[S.selRegion], 'is-target'); markSelPlace((d) => d.key === S.selRegion); }
    }
  }
  function setRegionAreaHover(on) {
    const map = S.exploreMap; if (!map) return;
    const sel = map.gLand.selectAll('path');
    if (on) {
      sel.on('mouseenter.exr', (e, f) => { const k = f.country && regionKeyOf(f.country); if (k) hoverRegion(k, true); })
        .on('mouseleave.exr', () => hoverRegion(null, false));
    } else {
      sel.on('mouseenter.exr', null).on('mouseleave.exr', null);
    }
  }
  function showRegion(key) {
    const r = REGION_BY_KEY[key]; if (!r) return;
    S.selRegion = key; S.selContinent = null; S.selWater = null;
    highlightRegionOn(S.exploreMap, r, 'is-target');
    markSelPlace((d) => d.key === key);
    renderRegionCard(key);
  }
  function renderRegionCard(key) {
    const r = REGION_BY_KEY[key]; if (!r) return;
    const card = $('atlasCard'); card.classList.add('shown');
    const names = r.members.map((c) => c.name).sort().join(' · ');
    card.innerHTML = `
      <div class="atlas-head"><span class="place-emoji">${ICON('map')}</span>
        <div><div class="atlas-name">${r.name}</div><div class="atlas-official">Region · ${r.members.length} countries</div></div></div>
      <div class="atlas-regionlist">${names}</div>
      ${r.fact ? `<div class="atlas-facts"><div class="fc-fact">${ICON('bulb')} <span>${r.fact}</span></div></div>` : ''}`;
  }

  const WATER_KIND = { ocean: 'Ocean', sea: 'Sea', gulf: 'Gulf', lake: 'Lake', river: 'River' };
  function showWater(w) {
    S.selWater = w.name; S.selContinent = null;
    if (S.exploreMap) {
      S.exploreMap.clearWaterArea('water-hover'); // drop the transient hover layer
      S.exploreMap.showWaterArea(w.name, 'water-sel'); // (globe-spanning oceans skip the fill by size)
      S.exploreMap.gPlaces.selectAll('g.place').classed('is-hovered', false);
      markSelPlace((d) => d.name === w.name); // the water's name pill = dark blue (selected)
    }
    const card = $('atlasCard'); card.classList.add('shown');
    const chips = chipHtml([['tag', WATER_KIND[w.type] || 'Water'], ['maximize', w.stat]].filter((c) => c[1]));
    card.innerHTML = `
      <div class="atlas-head">
        <span class="place-emoji">${ICON('waves')}</span>
        <div><div class="atlas-name">${w.name}</div><div class="atlas-official">${WATER_KIND[w.type] || ''}</div></div>
      </div>
      <div class="fc-chips">${chips}</div>
      <div class="atlas-facts"><div class="fc-fact">${ICON('bulb')} <span>${w.fact}</span></div></div>`;
  }

  function showAtlas(c) {
    const card = $('atlasCard');
    card.classList.add('shown');
    const neighbors = (c.neighbors || []).map((iso) => BY_ISO3[iso]).filter(Boolean);
    const chips = chipHtml(structuredChips(c));
    const facts = (c.facts && c.facts.length)
      ? `<div class="atlas-facts">${c.facts.map((f) => `<div class="fc-fact">${ICON('bulb')} <span>${f}</span></div>`).join('')}</div>` : '';
    const nb = neighbors.length
      ? `<div class="atlas-neighbors"><b>Neighbours:</b> ${neighbors.map((n) => `<button class="neighbor" data-iso="${n.iso3}">${n.name}</button>`).join(' ')}</div>` : '';
    card.innerHTML = `
      <div class="atlas-head">
        <img class="atlas-flag" src="${flagSvg(c.iso2)}" data-iso="${c.iso2}" alt="${c.name} flag" onerror="${onFlagError}">
        <div>
          <div class="atlas-name">${c.name}</div>
          <div class="atlas-official">${c.official || ''}</div>
        </div>
      </div>
      <div class="fc-chips">${chips}</div>
      ${facts}
      ${nb}`;
    card.querySelectorAll('.neighbor').forEach((btn) => {
      btn.onclick = () => { const n = BY_ISO3[btn.dataset.iso]; if (n) { showAtlas(n); S.exploreMap.highlight(n.iso3, { focus: true }); } };
    });
    S.exploreMap.highlight(c.iso3, { focus: false });
  }

  // Generic search box: wires an <input> + results dropdown to onSelect(country).
  function wireSearch(inputId, resultsId, onSelect) {
    const input = $(inputId), box = $(resultsId);
    const close = () => { box.hidden = true; box.innerHTML = ''; };
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return close();
      const hits = ALL.filter((c) => c.name.toLowerCase().includes(q) || (c.capital && c.capital.toLowerCase().includes(q))).slice(0, 8);
      if (!hits.length) return close();
      box.innerHTML = '';
      hits.forEach((c) => {
        const r = el('button', 'search-hit', `<img src="${flagSvg(c.iso2)}" data-iso="${c.iso2}" alt="" onerror="${onFlagError}"><span>${c.name}</span><small>${c.capital || ''}</small>`);
        r.onclick = () => { input.value = ''; close(); onSelect(c); };
        box.appendChild(r);
      });
      box.hidden = false;
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }

  // ---------- preview / study ----------
  function updateNameLabel(c) {
    if (!c) return;
    const lbl = $('nameLabel');
    const full = BY_NAME[c.name] || c;
    lbl.innerHTML = full.iso2
      ? `<img src="${flagSvg(full.iso2)}" data-iso="${full.iso2}" alt="" onerror="${onFlagError}"><span><b>${full.name}</b>${full.capital ? ' · ' + full.capital : ''}</span>`
      : `<span><b>${c.name}</b></span>`;
    lbl.hidden = false;
  }

  function buildPreviewRegions() {
    const row = $('previewRegions'); row.innerHTML = '';
    REGIONS.forEach((r, i) => {
      const b = el('button', 'chip' + (i === 0 ? ' active' : ''), r.label);
      b.onclick = () => {
        [...row.children].forEach((c) => c.classList.remove('active')); b.classList.add('active');
        S.previewMap.focusRegion(r.id === 'all' ? null : r.id);
      };
      row.appendChild(b);
    });
  }

  function openPreview() {
    show('previewScreen');
    $('nameLabel').hidden = true;
    if (!S.previewMap) {
      S.previewMap = new window.GlobeMap($('previewMap'), {
        onHover: (c) => { if (c) updateNameLabel(c); },
        onPick: (pick) => {
          updateNameLabel(pick.country || { name: pick.name });
          if (pick.country) S.previewMap.highlight(pick.country.iso3, { focus: false });
        },
      });
      S.previewMap.setInteractive(true);
      buildPreviewRegions();
      wireSearch('previewSearch', 'previewResults', (c) => {
        updateNameLabel(c); S.previewMap.highlight(c.iso3, { focus: true });
      });
    } else {
      S.previewMap.setInteractive(true);
    }
    // "Show all countries" is selected by default whenever you open Preview.
    $('labelToggle').setAttribute('aria-pressed', 'true');
    $('labelToggle').classList.add('active');
    requestAnimationFrame(() => { S.previewMap.resize(); S.previewMap.setLabels(true); });
  }

  function toggleMapFullscreen(panel, map, btn) {
    const on = !panel.classList.contains('is-fullscreen');
    panel.classList.toggle('is-fullscreen', on);
    document.body.classList.toggle('has-fullscreen-map', on);
    if (btn) btn.innerHTML = ICON(on ? 'compress' : 'expand');
    if (map) { map.resize(); requestAnimationFrame(() => map.resize()); }
  }

  function exitFullscreen() {
    const panel = $('previewMapPanel');
    if (!panel || !panel.classList.contains('is-fullscreen')) return false;
    toggleMapFullscreen(panel, S.previewMap, $('pvFull'));
    return true;
  }

  // ---------- confetti (cheap, no library) ----------
  const cv = $('confetti');
  const ctx = cv.getContext('2d');
  let parts = [];
  function sizeCanvas() { cv.width = window.innerWidth; cv.height = window.innerHeight; }
  window.addEventListener('resize', sizeCanvas); sizeCanvas();
  const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4dabf7', '#b197fc', '#ff9f1c'];
  function spawn(count, originY) {
    for (let i = 0; i < count; i++) {
      parts.push({
        x: cv.width / 2 + (Math.random() - 0.5) * 120,
        y: originY,
        vx: (Math.random() - 0.5) * 8,
        vy: -6 - Math.random() * 7,
        g: 0.25 + Math.random() * 0.1,
        s: 5 + Math.random() * 6,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, life: 1,
      });
    }
    if (parts.length && !raf) tick();
  }
  const burst = () => spawn(40, cv.height * 0.32);
  const bigBurst = () => spawn(120, cv.height * 0.4);
  let raf = null;
  function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
    });
    parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 40);
    raf = parts.length ? requestAnimationFrame(tick) : null;
  }

  // ---------- wiring ----------
  function goHome() { show('homeScreen'); }

  // Fill in all the static flat icons (single source of truth = icons.js).
  function paintStaticIcons() {
    $('brandIcon').innerHTML = UME('2d-happy', 'brand-ume');
    $('atlasEmptyIcon').innerHTML = UME('2d-playful');
    $('statScore').insertAdjacentHTML('afterbegin', ICON('star'));
    $('statStreak').insertAdjacentHTML('afterbegin', ICON('flame'));
    $('quitBtn').innerHTML = ICON('chevron-left') + 'Quit';
    $('exploreQuit').innerHTML = ICON('chevron-left') + 'Back';
    $('previewQuit').innerHTML = ICON('chevron-left') + 'Back';
    $('labelToggle').innerHTML = ICON('list') + 'Show all countries';
    $('settingsBtn').innerHTML = ICON('sliders');
    [['zoomIn', 'plus'], ['zoomOut', 'minus'], ['zoomReset', 'globe'],
     ['exZoomIn', 'plus'], ['exZoomOut', 'minus'], ['exZoomReset', 'globe'],
     ['pvFull', 'expand'], ['pvZoomIn', 'plus'], ['pvZoomOut', 'minus'], ['pvZoomReset', 'globe']]
      .forEach(([id, name]) => { $(id).innerHTML = ICON(name); });
  }

  function init() {
    GQA.init();
    paintStaticIcons();
    makeDraggable($('dock'));
    buildHome();
    wireSearch('exploreSearch', 'searchResults', (c) => { showAtlas(c); S.exploreMap.highlight(c.iso3, { focus: true }); });
    $('homeBtn').onclick = goHome;
    $('quickPlay').onclick = () => startCategory('find', 'countries');
    $('quitBtn').onclick = goHome;
    $('exploreQuit').onclick = goHome;
    $('previewQuit').onclick = goHome;
    $('chooseModeBtn').onclick = goHome;
    $('playAgainBtn').onclick = () => startRound(S.mode, { openSettings: true });
    $('nextBtn').onclick = () => { S.index++; nextQuestion(); };
    $('settingsBtn').onclick = toggleSettings;
    document.addEventListener('pointerdown', (e) => {
      if (!$('settingsPop').hidden && !e.target.closest('#settingsPop, #settingsBtn')) closeSettings();
    });
    $('zoomIn').onclick = () => S.roundMap && S.roundMap.zoomBy(1.6);
    $('zoomOut').onclick = () => S.roundMap && S.roundMap.zoomBy(1 / 1.6);
    $('zoomReset').onclick = () => S.roundMap && S.roundMap.resetView();
    $('exZoomIn').onclick = () => S.exploreMap && S.exploreMap.zoomBy(1.6);
    $('exZoomOut').onclick = () => S.exploreMap && S.exploreMap.zoomBy(1 / 1.6);
    $('exZoomReset').onclick = () => S.exploreMap && S.exploreMap.resetView();
    $('pvZoomIn').onclick = () => S.previewMap && S.previewMap.zoomBy(1.6);
    $('pvZoomOut').onclick = () => S.previewMap && S.previewMap.zoomBy(1 / 1.6);
    $('pvZoomReset').onclick = () => S.previewMap && S.previewMap.resetView();
    $('pvFull').onclick = () => toggleMapFullscreen($('previewMapPanel'), S.previewMap, $('pvFull'));
    $('labelToggle').onclick = () => {
      const on = $('labelToggle').getAttribute('aria-pressed') !== 'true';
      $('labelToggle').setAttribute('aria-pressed', on);
      $('labelToggle').classList.toggle('active', on);
      if (S.previewMap) S.previewMap.setLabels(on);
    };

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('settingsPop').hidden) { closeSettings(); return; }
      if (e.key === 'Escape' && exitFullscreen()) return;
      if (!$('roundScreen').hidden) {
        if (!S.answered && /^[1-4]$/.test(e.key)) {
          const opts = $('dockOptions').querySelectorAll('.opt');
          if (opts[+e.key - 1]) opts[+e.key - 1].click();
        } else if (S.answered && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); $('nextBtn').click();
        } else if (e.key === 'Escape') { goHome(); }
        else if (S.roundMap) { // zoom keys work in every mode
          if (e.key === '+' || e.key === '=') S.roundMap.zoomBy(1.6);
          else if (e.key === '-' || e.key === '_') S.roundMap.zoomBy(1 / 1.6);
          else if (e.key === '0') S.roundMap.resetView();
        }
      } else if ((!$('exploreScreen').hidden || !$('previewScreen').hidden) && e.key === 'Escape') { goHome(); }
    });
  }

  init();
})();
