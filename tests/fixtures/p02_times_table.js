import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("number", v.int(v.ask(t("Which table do you want? ")))),
    s.count("i", 1, 11, [
      s.say(x("number"), t("x"), x("i"), t("="), v.mul(x("number"), x("i"))),
    ]).blank(1),
  ],
);
