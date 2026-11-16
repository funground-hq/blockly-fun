import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("x", n(0)),
    s.set("y", n(0)),
    s.set("treasure_x", v.randint(1, 5)),
    s.set("treasure_y", v.randint(1, 5)),
    s.set("steps", n(0)),
    s.until(v.and(v.eq(x("x"), x("treasure_x")), v.eq(x("y"), x("treasure_y"))), [
      s.set("move", v.ask(t("Move (n/s/e/w): "))),
      s.if([
        [v.eq(x("move"), t("n")), [s.change("y", 1)]],
        [v.eq(x("move"), t("s")), [s.subtract("y", 1)]],
        [v.eq(x("move"), t("e")), [s.change("x", 1)]],
        [v.eq(x("move"), t("w")), [s.subtract("x", 1)]],
      ], [
        s.say(t("I don't know that move")),
        s.continue(),
      ]),
      s.change("steps", 1),
      s.say(t("You are at"), x("x"), x("y")),
    ]).blank(1),
    s.say(t("Found the treasure in"), x("steps"), t("steps!")).blank(1),
  ],
);
