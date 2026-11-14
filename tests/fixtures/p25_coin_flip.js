import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("heads", n(0)),
    s.set("tails", n(0)),
    s.count("flip", null, 20, [
      s.if([[v.eq(v.randint(0, 1), 0), [s.change("heads", 1)]]], [s.change("tails", 1)]),
    ]).blank(1),
    s.say(t("Heads:"), x("heads")).blank(1),
    s.say(t("Tails:"), x("tails")),
    s.if([
      [v.gt(x("heads"), x("tails")), [s.say(t("Heads wins"))]],
      [v.gt(x("tails"), x("heads")), [s.say(t("Tails wins"))]],
    ], [s.say(t("It's a tie"))]),
  ],
);
