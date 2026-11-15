import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.def("greet", "name, times", [
      s.count("i", null, x("times"), [s.say(v.add(v.add(t("Hello, "), x("name")), t("!")))]),
    ]),
  ],
  [
    s.def("square", "x", [s.ret(v.mul(x("x"), x("x")))]).blank(1),
  ],
  [
    s.own("greet", t("Mia"), 3).blank(1),
    s.say(t("5 squared is"), v.own("square", 5)),
    s.say(t("12 squared is"), v.own("square", 12)),
  ],
);
