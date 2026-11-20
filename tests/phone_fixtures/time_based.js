// The Time-based motion example of funground's gallery (animation/02_time_based.py), as blocks, for the phone layout of
// BF-D-053 (tools/phone_check.mjs). The Python it stands for, without the header:
//
//   import funground as f
//
//   x = 0
//
//
//   def setup():
//       f.size(640, 400)
//
//
//   def draw():
//       global x
//       f.background("white")
//       f.fill("seagreen")
//       f.circle(x, f.height / 2, 80)         # the gallery's circle is 60; the phone check's tasks start from 80 (task 1: 80 to 120)
//       x += 150 * f.delta_time
//       if x > f.width:
//           x = 0
//
//   f.run()

import { stmt as s, val as v, text as t, name as x, program } from "../dsl.js";

/** `f.delta_time`: an attribute read of the name f. */
const deltaTime = { type: "bf_attribute", fields: { NAME: "delta_time" }, inputs: { OBJ: { block: { type: "bf_variable", fields: { VAR: "f" } } } } };

export default program(
  [s.set("x", 0)],
  s.sketchStart([s.canvasSize(640, 400)]).blank(2),
  s.sketchFrame([
    s.background(t("white")),
    s.fill(t("seagreen")),
    s.circle(x("x"), v.div(v.sketch("height"), 2), 80),
    s.change("x", v.mul(150, deltaTime)),
    s.if([[v.gt(x("x"), v.sketch("width")), [s.set("x", 0)]]]),
  ]).blank(2),
);
