// The switch of look (BF-D-053): two buttons in the list's top row, "Blocks | Python". The current one is marked (aria-pressed). Each button
// is 44 px high at least (style.js). It only draws: the host says what a tap does and tells it when the look changes by other means.
//
//   const switcher = createLookSwitch(host, {looks: {blocks: "Blocks", code: "Python"}, current: "blocks", onChoose(look)});
//   switcher.show("code");       // the look changed (the host asked for it): the marks follow

import { addPhoneStyle, make } from "./style.js";

export function createLookSwitch(host, { looks, current, onChoose }) {
  addPhoneStyle();
  const root = make("div", "bfp-switch", undefined, { role: "group", "aria-label": "Show the blocks as" });
  const buttons = Object.entries(looks).map(([look, label]) => {
    const button = make("button", "", label, { type: "button", "data-bf": `look-${look}`, "aria-pressed": "false" });
    button.addEventListener("click", () => onChoose(look));
    root.append(button);
    return [look, button];
  });
  const show = (look) => {
    for (const [name, button] of buttons) button.setAttribute("aria-pressed", String(name === look));
  };
  show(current);
  host.append(root);
  return { root, show };
}
