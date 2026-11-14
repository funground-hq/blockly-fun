import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.count("i", 1, 21, [
      s.if([[v.eq(v.mod(x("i"), 4), 0), [s.continue()]]]),
      s.if([[v.gt(x("i"), 17), [s.break()]]]),
      s.say(x("i")),
    ]),
    s.say(t("done")).blank(1),
  ],
);
