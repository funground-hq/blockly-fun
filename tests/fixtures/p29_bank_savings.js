import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("money", n("100.0")).comment("starting money", { trailing: true }),
    s.set("rate", n("0.05")).comment("5 percent each year", { trailing: true }),
    s.set("year", n(0)),
    s.while(v.lt(x("money"), 200), [
      s.set("money", v.add(x("money"), v.mul(x("money"), x("rate")))),
      s.set("year", v.add(x("year"), 1)),
      s.say(t("Year"), x("year"), t(":"), v.call("round", x("money"), 2)),
    ]).blank(1),
    s.say(t("It took"), x("year"), t("years to double!")).blank(1),
  ],
);
