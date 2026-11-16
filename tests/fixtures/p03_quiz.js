import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("score", n(0)),
    s.set("answer", v.ask(t("What is the capital of France? "))).blank(1),
    s.if([
      [v.eq(v.method(x("answer"), "lower"), t("paris")), [
        s.say(t("Correct!")),
        s.change("score", 1),
      ]],
    ], [s.say(t("Nope, it is Paris."))]),
    s.set("answer", v.ask(t("How many legs does a spider have? "))).blank(1),
    s.if([
      [v.eq(x("answer"), t("8")), [
        s.say(t("Correct!")),
        s.change("score", 1),
      ]],
    ], [s.say(t("Nope, it is 8."))]),
    s.set("answer", v.ask(t("What colour do you get from blue and yellow? "))).blank(1),
    s.if([
      [v.eq(v.method(x("answer"), "lower"), t("green")), [
        s.say(t("Correct!")),
        s.change("score", 1),
      ]],
    ], [s.say(t("Nope, it is green."))]),
    s.say(v.code("f\"You scored {score} out of 3\"")).blank(1),
  ],
);
