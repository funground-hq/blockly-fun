// The search box stays above the phone's keyboard (BF-D-051). When the on-screen keyboard opens, a phone browser usually
// does not shrink the page: it shrinks the "visual viewport" (what is seen) and leaves the "layout viewport" (what the page is
// laid out in) alone, so a box at the foot of the page ends up under the keys. This watches the visual viewport
// (window.visualViewport: its resize and scroll events) and, while the keyboard is up, leaves the editor's frame room at its
// foot as tall as the part the keyboard covers. The blocks, the row of kinds, the list of blocks and the search box (all inside
// the frame) are then above the keys, and the foot bar steps out of the way (a class on the frame hides it).
//
// A page that asks for its layout to shrink with the keyboard (the viewport's "interactive-widget=resizes-content") needs none
// of this: the frame is then already above the keyboard, and the part covered is zero.

const NO_KEYBOARD = 80;      // a visual viewport shorter than the frame by less than this is not a keyboard (a toolbar sliding away)

/** How much of the frame's foot the visual viewport leaves covered, in CSS px; 0 when it is not a keyboard. */
export function coveredHeight(frameBottom, viewport) {
  if (!viewport) return 0;
  const covered = frameBottom - (viewport.offsetTop + viewport.height);
  return covered > NO_KEYBOARD ? Math.round(covered) : 0;
}

/**
 * Keeps `frame` above the keyboard. `changed(height)` is called after the room changes, with the covered height, so the
 * blocks can measure their page again. Gives a function that stops watching.
 */
export function keepAboveKeyboard(frame, changed, viewport = globalThis.visualViewport) {
  if (!viewport) return () => {};
  let covered = 0;
  const update = () => {
    const height = coveredHeight(frame.getBoundingClientRect().bottom, viewport);
    if (height === covered) return;
    covered = height;
    frame.style.paddingBottom = height ? `${height}px` : "";
    frame.classList.toggle("bf-keyboard", height > 0);
    changed(height);
  };
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
  };
}
