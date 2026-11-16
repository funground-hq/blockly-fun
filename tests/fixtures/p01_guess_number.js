import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("secret", v.randint(1, 20)),
    s.set("tries", n(0)),
    s.say(t("I am thinking of a number from 1 to 20.")).blank(1),
    s.forever([
      s.set("guess", v.int(v.ask(t("Your guess: ")))),
      s.set("tries", v.add(x("tries"), 1)),
      s.if([
        [v.lt(x("guess"), x("secret")), [s.say(t("Too low!"))]],
        [v.gt(x("guess"), x("secret")), [s.say(t("Too high!"))]],
      ], [
        s.say(t("You got it in"), x("tries"), t("tries!")),
        s.break(),
      ]),
    ]),
  ],
);
