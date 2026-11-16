import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("celsius", v.float(v.ask(t("Temperature in C: ")))),
    s.set("fahrenheit", v.add(v.div(v.mul(x("celsius"), 9), 5), 32)),
    s.say(x("celsius"), t("C is"), x("fahrenheit"), t("F")),
    s.if([
      [v.lt(x("celsius"), 10), [s.say(t("Wear a coat!"))]],
      [v.gt(x("celsius"), 25), [s.say(t("It's hot!"))]],
    ], [s.say(t("Nice weather."))]).blank(1),
  ],
);
