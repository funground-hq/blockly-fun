import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.countBy("n", 10, 0, -1, [
      s.say(x("n")),
      s.wait(1),
    ]),
    s.say(t("Blast off!")),
  ],
);
