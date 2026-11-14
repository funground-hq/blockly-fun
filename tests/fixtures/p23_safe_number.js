import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.forever([
      s.code(
        "try:\n" +
        "    age = int(input(\"How old are you? \"))\n" +
        "    break\n" +
        "except ValueError:\n" +
        "    print(\"Please type a number!\")"
      ),
    ]),
    s.if([[v.ge(x("age"), 13), [s.say(t("You are a teenager"))]]], [
      s.say(t("You will be a teenager in"), v.sub(13, x("age")), t("years")),
    ]).blank(1),
  ],
);
