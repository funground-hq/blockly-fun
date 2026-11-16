import { stmt as s, val as v, text as t, name as x, program } from "../dsl.js";

export default program(
  [
    s.canvasSize(400, 400),
    s.background(t("skyblue")),
    s.fill(t("green")),
    s.rectangle(0, 300, 400, 100),
    s.fill(t("yellow")),
    s.circle(320, 80, 90),
    s.count("i", null, 5, [
      s.circle(v.add(60, v.mul(x("i"), 70)), 280, 30),
    ]),
  ],
);
