import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("score", n(0)),
    s.set("lives", n(3)),
    s.while(v.gt(x("lives"), 0), [
      s.set("answer", v.ask(t("Did you catch the apple? (y/n) "))),
      s.if([
        [v.eq(x("answer"), t("y")), [
          s.set("score", v.add(x("score"), 10)),
          s.say(t("Score:"), x("score")),
        ]],
      ], [
        s.set("lives", v.sub(x("lives"), 1)),
        s.say(t("Oops! Lives left:"), x("lives")),
      ]),
    ]).blank(1),
    s.say(t("Game over. Final score:"), x("score")).blank(1),
  ],
);
