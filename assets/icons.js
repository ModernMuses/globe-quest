/* Globe Quest — flat icon set.
 * One consistent line-icon style (24x24, 2px stroke, round caps), drawn with
 * currentColor so every icon adapts to the theme and to its surrounding text
 * colour. Country flags are NOT icons — they stay as real flag images.
 *
 * Use:  el.innerHTML = icon('globe')            // returns an <svg> string
 * Add new icons by dropping another entry in ICONS.
 */
(function () {
  'use strict';
  const ICONS = {
    // brand / chrome
    globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.5 2.6 15.5 0 18"/><path d="M12 3c-2.6 2.5-2.6 15.5 0 18"/>`,
    moon: `<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>`,
    sun: `<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`,
    // modes
    crosshair: `<circle cx="12" cy="12" r="9"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2.3"/>`,
    pin: `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.6"/>`,
    flag: `<path d="M5 21V4M5 4s1.2-1 4-1 4.8 2 7.5 2c1.4 0 2.5-.6 2.5-.6V14s-1.1.6-2.5.6c-2.7 0-4.2-2-7.5-2-1.6 0-3 .6-3 .6"/>`,
    grid: `<rect x="3.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.4"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.4"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.4"/>`,
    landmark: `<path d="M3.5 21h17M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9M3.5 12 12 4l8.5 8z"/>`,
    building: `<path d="M4 21V8l6-4v17M14 21V11l6-3v13M3 21h18M7 9v0M7 13v0M7 17v0M17 14v0M17 18v0"/>`,
    shuffle: `<path d="M16 4h4v4M21 3l-7 7M16 20h4v-4M21 21l-6-6M3 4l5 5M3 20l16-16"/>`,
    compass: `<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4 13.5 13.5 8.4 15.6 10.5 10.5z"/>`,
    eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
    // chips
    map: `<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4z"/><path d="M9 4v13M15 7v12.5"/>`,
    message: `<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/>`,
    coin: `<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.2A2.4 2.4 0 0 0 12.4 8h-1.1a2.1 2.1 0 0 0 0 4.2h1.4a2.1 2.1 0 0 1 0 4.2h-1.2a2.4 2.4 0 0 1-2.2-1.2M12 6.4v1.4M12 16.2v1.4"/>`,
    waves: `<path d="M2 7c.7.6 1.4 1 2.6 1C7 8 7 6 9.5 6s2.5 2 4.9 2S17 6 19.4 6c1.2 0 1.9.4 2.6 1M2 12.5c.7.6 1.4 1 2.6 1 2.5 0 2.5-2 4.9-2s2.5 2 4.9 2 2.5-2 5-2c1.2 0 1.9.4 2.6 1M2 18c.7.6 1.4 1 2.6 1 2.5 0 2.5-2 4.9-2s2.5 2 4.9 2 2.5-2 5-2c1.2 0 1.9.4 2.6 1"/>`,
    mountain: `<path d="M3 20h18L14 7l-3.2 5.8L8.5 9 3 20z"/><path d="m10.8 12.8 1.4-2.5"/>`,
    share: `<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 13.3 7.4 4.3M15.7 6.4 8.3 10.7"/>`,
    maximize: `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M8 21H5a2 2 0 0 1-2-2v-3m18 0v3a2 2 0 0 1-2 2h-3"/>`,
    bulb: `<path d="M9 18h6M10 21.5h4M15.1 14c.2-1 .7-1.8 1.4-2.5A4.7 4.7 0 1 0 7.5 11.5c.7.7 1.2 1.5 1.4 2.5"/>`,
    // feedback / results
    'check-circle': `<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m8.5 11.5 3 3L22 4.5"/>`,
    trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4.5a2 2 0 0 0 0 4H7M17 6h2.5a2 2 0 0 1 0 4H17M9 19h6M8 22h8M12 14v5"/>`,
    star: `<path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8-4.2-4.1 5.8-.8z"/>`,
    flame: `<path d="M12 2.5c.6 2.7 2 4.3 3.4 5.6 1.6 1.5 2.6 3.3 2.6 5.4a6 6 0 1 1-12 0c0-1 .3-2 .9-2.8.4 1 1.2 1.6 2.1 1.6A2.3 2.3 0 0 0 11.3 9c0-1.4-.8-2-1.3-3-.8-1.7-.3-3.6 2-3.5z"/>`,
    'thumbs-up': `<path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z"/><path d="M7 11l4.5-8.2a2.2 2.2 0 0 1 3 .9c.2.4.3.9.2 1.4L14 9h5.2a2 2 0 0 1 2 2.3l-1.1 7a2 2 0 0 1-2 1.7H7"/>`,
    sprout: `<path d="M7 20h10M12 20c0-4 0-6 2-8M12 14c-3.5 0-5.5-2-6-5 3-.4 5 .6 6 3M12 12c0-3 1.5-5 5-5.5-.2 3-1.7 5-5 5.5z"/>`,
    // tools / nav
    plus: `<path d="M12 5v14M5 12h14"/>`,
    minus: `<path d="M5 12h14"/>`,
    expand: `<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>`,
    compress: `<path d="M4 10h6V4M20 14h-6v6M14 4v6h6M10 20v-6H4"/>`,
    'chevron-left': `<path d="M15 5l-7 7 7 7"/>`,
    'chevron-right': `<path d="M9 5l7 7-7 7"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`,
    tag: `<path d="M3 8.5v-4a1.5 1.5 0 0 1 1.5-1.5h4a2 2 0 0 1 1.4.6l9 9a2 2 0 0 1 0 2.8l-4 4a2 2 0 0 1-2.8 0l-9-9A2 2 0 0 1 3 8.5z"/><circle cx="7.5" cy="7.5" r="1.3"/>`,
    list: `<path d="M8 6h13M8 12h13M8 18h13M3.5 6h0M3.5 12h0M3.5 18h0"/>`,
    sliders: `<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h12M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>`,
  };

  window.ICONS = ICONS;
  window.icon = function (name, cls) {
    return `<svg class="icon${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  };
})();
