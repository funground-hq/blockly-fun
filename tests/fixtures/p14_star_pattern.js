import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("size", n(5)),
    s.count("row", 1, v.add(x("size"), 1), [s.say(v.mul(t("*"), x("row")))]).blank(1).comment("triangle going up"),
    s.countBy("row", x("size"), 0, -1, [s.say(v.mul(t("*"), x("row")))]).blank(1).comment("triangle going down"),
    s.count("i", null, x("size"), [s.call("print", t("*"), kw("end", t("")))]).blank(1).comment("stars in a line"),
    s.say(),
  ],
);
