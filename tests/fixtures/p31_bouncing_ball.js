import { stmt as s, val as v, text as t, name as x, program } from "../dsl.js";

export default program(
  [
    s.set("x", 50),
    s.set("speed", 4),
  ],
  s.sketchStart([
    s.canvasSize(640, 400),
  ]).blank(2),
  s.sketchFrame([
    s.background(t("midnightblue")).blank(1),
    s.outline(t("white")),
    s.line(0, 300, v.sketch("width"), 300),
    s.fill(t("gold")),
    s.circle(x("x"), 260, 80),
    s.change("x", x("speed")),
    s.if([[v.or(v.gt(x("x"), v.sub(v.sketch("width"), 40)), v.lt(x("x"), 40)), [
      s.set("speed", v.neg(x("speed"))),
    ]]]),
    s.fill(t("white")),
    s.write(v.add(t("Frame "), v.str(v.sketch("frame_count"))), 20, 40),
    s.rectangle(v.sketch("mouse_x"), v.sketch("mouse_y"), 20, 20),
  ]).blank(2),
);
