import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.def("is_even", "n", [s.ret(v.eq(v.mod(x("n"), 2), 0))]),
  ],
  [
    s.count("number", 1, 11, [
      s.if([[v.call("is_even", x("number")), [s.say(x("number"), t("is even"))]]], [s.say(x("number"), t("is odd"))]),
    ]).blank(1),
  ],
);
