import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("choices", v.listOf(t("rock"), t("paper"), t("scissors"))),
    s.set("player", v.ask(t("rock, paper or scissors? "))),
    s.set("computer", v.method(x("random"), "choice", x("choices"))),
    s.say(t("Computer chose"), x("computer")),
    s.if([
      [v.eq(x("player"), x("computer")), [s.say(t("Draw"))]],
      [v.and(v.eq(x("player"), t("rock")), v.eq(x("computer"), t("scissors"))), [s.say(t("You win!"))]],
      [v.and(v.eq(x("player"), t("paper")), v.eq(x("computer"), t("rock"))), [s.say(t("You win!"))]],
      [v.and(v.eq(x("player"), t("scissors")), v.eq(x("computer"), t("paper"))), [s.say(t("You win!"))]],
    ], [s.say(t("You lose!"))]).blank(1),
  ],
);
