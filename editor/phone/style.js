// The style the phone's shared parts bring (the slot sheet, the block list, the bar of actions). Plain CSS, added to the page once.
// Colours and the typeface come from the page's custom properties (--ink, --paper, --panel, --line, --muted, --gold, --body), with
// the same fall-backs the other parts have. Every tap target is 44 px high at least (the pass mark of BF-D-053).

export const TARGET = 44;

const STYLE = `
.bfp-sheet, .bfp-list, .bfp-bar { box-sizing: border-box; font-family: var(--body, system-ui, sans-serif); color: var(--ink, #191970); }
.bfp-sheet button, .bfp-list button, .bfp-bar button, .bfp-switch button { font: 600 15px var(--body, system-ui, sans-serif); color: inherit; min-height: ${TARGET}px; min-width: ${TARGET}px;
  padding: 0 10px; border: 1.5px solid var(--ink, #191970); border-radius: 10px; background: var(--paper, #fdf6e7); touch-action: manipulation; cursor: pointer; }
.bfp-sheet button:disabled, .bfp-bar button:disabled { opacity: 0.4; }
.bfp-sheet button:focus-visible, .bfp-list button:focus-visible, .bfp-bar button:focus-visible { outline: 3px solid var(--gold, #ffd700); outline-offset: 2px; }

.bfp-sheet { position: absolute; left: 0; right: 0; bottom: var(--bfh-keyboard, 0px); z-index: 100; max-height: 64%; overflow-y: auto; overscroll-behavior: contain;
  background: var(--panel, #fffaf0); border-top: 2px solid var(--ink, #191970); box-shadow: 0 -8px 22px rgba(0, 0, 0, 0.18); padding: 6px 8px 8px; }
.bfp-sheet[hidden], .bfp-list[hidden], .bfp-bar[hidden] { display: none; }
.bfp-head { display: flex; align-items: center; gap: 8px; }
.bfp-title { flex: 1; min-width: 0; font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bfp-slider { display: block; width: 100%; height: ${TARGET}px; margin: 2px 0; touch-action: pan-x; accent-color: var(--ink, #191970); }
.bfp-slider { -webkit-appearance: none; appearance: none; background: transparent; }
.bfp-slider::-webkit-slider-runnable-track { height: 10px; border-radius: 5px; background: var(--line, #d8cdb5); }
.bfp-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; height: 28px; width: 28px; margin-top: -9px; border-radius: 50%;
  background: var(--ink, #191970); border: 3px solid var(--paper, #fdf6e7); box-shadow: 0 0 0 1.5px var(--ink, #191970); }
.bfp-slider::-moz-range-track { height: 10px; border-radius: 5px; background: var(--line, #d8cdb5); }
.bfp-slider::-moz-range-thumb { height: 22px; width: 22px; border-radius: 50%; background: var(--ink, #191970); border: 3px solid var(--paper, #fdf6e7); }
.bfp-display { display: flex; align-items: center; gap: 6px; }
.bfp-number { flex: 1; min-height: ${TARGET}px; display: flex; align-items: center; padding: 0 10px; border: 1.5px solid var(--line, #d8cdb5);
  border-radius: 10px; background: #fff; font: 700 20px var(--body, system-ui, sans-serif); }
.bfp-pad { display: grid; grid-template-columns: repeat(3, 1fr) ${TARGET + 8}px; gap: 6px; margin-top: 6px; }
.bfp-pad button { font-size: 18px; }
.bfp-op { background: var(--rail, #efe6d2); font-size: 20px; }
.bfp-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.bfp-row .bfp-label { flex: none; width: 100%; font-size: 15px; color: var(--muted, #5a5f84); margin: 0; }
.bfp-chip { border-radius: 22px; }
.bfp-name { display: flex; gap: 6px; margin-top: 6px; }
.bfp-name input { flex: 1; min-width: 0; height: ${TARGET}px; padding: 0 10px; border: 1.5px solid var(--ink, #191970); border-radius: 10px;
  font: 16px var(--body, system-ui, sans-serif); }   /* 16 px: a phone browser zooms in on a smaller one */
.bfp-say { margin: 6px 2px 0; font-size: 15px; min-height: 18px; }

.bfp-names { margin-top: 6px; }
.bfp-names .bfp-group { padding: 6px 4px 2px; font-size: 14px; font-weight: 700; color: var(--muted, #5a5f84); }
.bfp-names .bfp-name-row { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; width: 100%; margin-top: 4px; padding: 4px 10px;
  text-align: left; font-weight: 500; }
.bfp-names .bfp-name-word { font-weight: 700; overflow-wrap: anywhere; }
.bfp-names .bfp-name-plain { font-size: 14px; font-weight: 400; color: var(--muted, #5a5f84); }
.bfp-names .bfp-name-row[aria-selected="true"] { background: var(--ink, #191970); color: var(--paper, #fdf6e7); }
.bfp-names .bfp-name-row[aria-selected="true"] .bfp-name-plain { color: inherit; }

.bfp-switch { display: flex; gap: 6px; }
.bfp-switch button[aria-pressed="true"] { background: var(--ink, #191970); color: var(--paper, #fdf6e7); }

.bfp-list { position: absolute; inset: 0; z-index: 110; display: flex; flex-direction: column; background: var(--panel, #fffaf0); }
.bfp-find { display: flex; gap: 6px; padding: 8px; border-bottom: 2px solid var(--ink, #191970); }
.bfp-find input { flex: 1; min-width: 0; height: ${TARGET}px; padding: 0 10px; border: 1.5px solid var(--ink, #191970); border-radius: 10px;
  font: 16px var(--body, system-ui, sans-serif); }
.bfp-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 8px; }
.bfp-chips button { border-radius: 22px; padding: 0 12px; }
.bfp-chips button[aria-pressed="true"] { background: var(--ink, #191970); color: var(--paper, #fdf6e7); }
.bfp-rows { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
.bfp-rows .bfp-block { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--line, #d8cdb5);
  border-radius: 0; background: transparent; min-height: 48px; padding: 4px 12px; font-weight: 500; }
.bfp-mark { flex: none; width: 14px; height: 30px; border-radius: 4px; }
.bfp-more { padding: 12px; font-size: 15px; color: var(--muted, #5a5f84); }

.bfp-bar { position: absolute; left: 0; right: 0; bottom: var(--bfh-keyboard, 0px); z-index: 90; background: var(--ink, #191970); color: var(--paper, #fdf6e7); padding: 6px; }
.bfp-bar .bfp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.bfp-bar button { color: var(--paper, #fdf6e7); background: transparent; border-color: var(--paper, #fdf6e7); padding: 0 4px; font-size: 15px; }
.bfp-bar .bfp-info { font-size: 15px; padding: 2px 4px 6px; min-height: 18px; }
.bfp-bar .bfp-error { background: #b3261e; color: #fff; border-radius: 8px; padding: 6px 8px; margin-bottom: 6px; font-size: 15px; }
.bfp-bar .bfp-error[hidden] { display: none; }
.bfp-bar .bfp-wide { grid-column: span 4; }
`;

const added = new Set();

/** Puts the style of the phone parts on the page, once. */
export function addPhoneStyle() {
  if (typeof document === "undefined" || added.has(document)) return;
  added.add(document);
  const style = document.createElement("style");
  style.id = "bf-phone-parts-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/**
 * A part that opens while a finger is still on the screen (the sheet, opened by a tap on a value) must not take that tap's own click:
 * the browser sends the click of a touch to whatever is under the finger when it lifts, and that was the new slider (a tap on a
 * number set it to the number under the finger: found by tools/phone_check.mjs). The part ignores touches for a moment.
 */
export function ignoreGhostClick(el, ms = 300) {
  el.style.pointerEvents = "none";
  setTimeout(() => { el.style.pointerEvents = ""; }, ms);
}

/** A small helper: an element with a class, a text and attributes. */
export function make(tag, className, text, attributes = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}
