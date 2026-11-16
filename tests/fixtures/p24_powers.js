import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("base", n(2)),
    s.count("power", 0, 11, [
      s.say(x("base"), t("to the power"), x("power"), t("is"), v.pow(x("base"), x("power"))),
    ]),
    s.set("seconds", n(5000)).blank(1),
    s.set("minutes", v.floordiv(x("seconds"), 60)),
    s.set("left", v.mod(x("seconds"), 60)),
    s.say(x("seconds"), t("seconds is"), x("minutes"), t("minutes and"), x("left"), t("seconds")),
  ],
);
