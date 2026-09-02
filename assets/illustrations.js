/* Globe Quest — category illustrations for the home screen.
 * Bigger, two-tone cousins of the flat icon set in icons.js: a soft colour-washed
 * circle backdrop + one or two solid shapes. Each category (countries/continents/
 * oceans/rivers/capitals/flags) gets exactly ONE illustration, reused everywhere
 * that category shows up (Find on Map / Name It / Match / Explore) so the same
 * glyph + colour always means the same thing.
 *
 * Use:  el.innerHTML = illustration('countries')   // returns an <svg> string
 */
(function () {
  'use strict';
  const ILLUS = {
    countries: `
      <circle cx="24" cy="24" r="21" fill="var(--c3)" opacity=".18"/>
      <path d="M10 29c-2-6 2-12 8-13s13 2 15 7-2 10-8 12-13-1-15-6z" fill="var(--c3)"/>
      <g fill="var(--accent)">
        <path d="M24 15c4 0 7 3 7 7 0 5-7 12-7 12s-7-7-7-12c0-4 3-7 7-7z"/>
        <circle cx="24" cy="22" r="2.4" fill="var(--surface)"/>
      </g>`,
    continents: `
      <circle cx="24" cy="24" r="21" fill="var(--accent)" opacity=".12"/>
      <ellipse cx="18" cy="19" rx="7" ry="5" fill="var(--c1)" transform="rotate(-15 18 19)"/>
      <ellipse cx="29" cy="26" rx="6.5" ry="8" fill="var(--c3)" transform="rotate(10 29 26)"/>
      <ellipse cx="19" cy="32" rx="5" ry="4" fill="var(--c6)"/>`,
    regions: `
      <circle cx="24" cy="24" r="21" fill="var(--accent)" opacity=".12"/>
      <ellipse cx="17" cy="17" rx="5" ry="4" fill="var(--c1)" transform="rotate(-15 17 17)"/>
      <ellipse cx="28" cy="16" rx="4.5" ry="4" fill="var(--c3)"/>
      <ellipse cx="32" cy="25" rx="4.5" ry="5" fill="var(--c0)" transform="rotate(10 32 25)"/>
      <ellipse cx="18" cy="27" rx="5" ry="5" fill="var(--c6)"/>
      <ellipse cx="26" cy="31" rx="5" ry="4" fill="var(--c4)"/>
      <ellipse cx="14" cy="24" rx="3.5" ry="4" fill="var(--c2)"/>`,
    oceans: `
      <circle cx="24" cy="24" r="21" fill="var(--c5)" opacity=".22"/>
      <g transform="translate(4,4) scale(1.6)" fill="none" stroke="var(--accent-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 7c.7.6 1.4 1 2.6 1C7 8 7 6 9.5 6s2.5 2 4.9 2S17 6 19.4 6c1.2 0 1.9.4 2.6 1"/>
        <path d="M2 12.5c.7.6 1.4 1 2.6 1 2.5 0 2.5-2 4.9-2s2.5 2 4.9 2 2.5-2 5-2c1.2 0 1.9.4 2.6 1" opacity=".6"/>
        <path d="M2 18c.7.6 1.4 1 2.6 1 2.5 0 2.5-2 4.9-2s2.5 2 4.9 2 2.5-2 5-2c1.2 0 1.9.4 2.6 1" opacity=".35"/>
      </g>`,
    rivers: `
      <circle cx="24" cy="24" r="21" fill="var(--c4)" opacity=".2"/>
      <path d="M10 13c8 0 4 10 12 10s4 10 12 10" fill="none" stroke="var(--accent-2)" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="36" cy="34" rx="5" ry="3.6" fill="var(--accent-2)" opacity=".55"/>`,
    capitals: `
      <circle cx="24" cy="24" r="21" fill="var(--c1)" opacity=".24"/>
      <g transform="translate(6,7) scale(1.4)">
        <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8-4.2-4.1 5.8-.8z" fill="var(--target)" stroke="var(--target-stroke)" stroke-width="1" stroke-linejoin="round"/>
      </g>`,
    flags: `
      <circle cx="24" cy="24" r="21" fill="var(--c0)" opacity=".18"/>
      <line x1="17" y1="34" x2="17" y2="12" stroke="var(--text)" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="17" y="12" width="15" height="5" fill="var(--c0)"/>
      <rect x="17" y="17" width="15" height="5" fill="var(--c1)"/>`,
    mix: `
      <circle cx="24" cy="24" r="21" fill="var(--surface-2)"/>
      <g transform="translate(4,20) rotate(-8 12 8)">
        <line x1="6" y1="16" x2="6" y2="2" stroke="var(--text)" stroke-width="2" stroke-linecap="round"/>
        <rect x="6" y="2" width="10" height="3.5" fill="var(--c0)"/>
        <rect x="6" y="5.5" width="10" height="3.5" fill="var(--c1)"/>
      </g>
      <g transform="translate(21,2) scale(0.85) rotate(10 12 11)">
        <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8-4.2-4.1 5.8-.8z" fill="var(--target)" stroke="var(--target-stroke)" stroke-width="1" stroke-linejoin="round"/>
      </g>
      <g transform="translate(24,22) scale(0.85)" fill="var(--accent)">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/>
        <circle cx="12" cy="10" r="2.6" fill="var(--surface-2)"/>
      </g>`,
  };

  window.ILLUS = ILLUS;
  window.illustration = function (name, cls) {
    return `<svg class="illus${cls ? ' ' + cls : ''}" viewBox="0 0 48 48" aria-hidden="true">${ILLUS[name] || ''}</svg>`;
  };
})();
