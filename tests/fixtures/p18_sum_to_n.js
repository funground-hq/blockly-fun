import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("n", v.int(v.ask(t("Add up to: ")))),
    s.set("total", n(0)),
    s.count("i", 1, v.add(x("n"), 1), [s.set("total", v.add(x("total"), x("i")))]).blank(1),
    s.say(t("The sum of 1 to"), x("n"), t("is"), x("total")).blank(1),
    s.say(t("Check:"), v.floordiv(v.mul(x("n"), v.add(x("n"), 1)), 2)),
  ],
);
