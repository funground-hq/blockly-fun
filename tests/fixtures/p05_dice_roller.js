import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.count("turn", null, 5, [
      s.set("dice1", v.randint(1, 6)),
      s.set("dice2", v.randint(1, 6)),
      s.set("total", v.add(x("dice1"), x("dice2"))),
      s.say(t("Roll"), v.add(x("turn"), 1), t(":"), x("dice1"), t("and"), x("dice2"), t("="), x("total")),
      s.if([[v.eq(x("dice1"), x("dice2")), [s.say(t("Double!"))]]]),
    ]).comment("roll two dice five times"),
  ],
);
