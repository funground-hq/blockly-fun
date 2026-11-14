import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.count("i", 1, 31, [
      s.if([
        [v.and(v.eq(v.mod(x("i"), 3), 0), v.eq(v.mod(x("i"), 5), 0)), [s.say(t("FizzBuzz"))]],
        [v.eq(v.mod(x("i"), 3), 0), [s.say(t("Fizz"))]],
        [v.eq(v.mod(x("i"), 5), 0), [s.say(t("Buzz"))]],
      ], [s.say(x("i"))]),
    ]),
  ],
);
