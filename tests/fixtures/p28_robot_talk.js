import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.say(t("Beep boop. I am RoboBuddy.")),
    s.wait(1),
    s.set("name", v.ask(t("What is your name? "))),
    s.say(t("Nice to meet you,"), x("name")),
    s.wait(1),
    s.set("mood", v.ask(t("Are you happy? "))).blank(1),
    s.if([
      [v.or(v.eq(v.method(x("mood"), "lower"), t("yes")), v.eq(v.method(x("mood"), "lower"), t("y"))), [
        s.say(t("Great! Let's play.")),
      ]],
    ], [
      s.say(t("Oh no. Let me tell you a joke.")),
      s.wait(2),
      s.say(t("Why did the robot go on holiday? To recharge!")),
    ]),
  ],
);
