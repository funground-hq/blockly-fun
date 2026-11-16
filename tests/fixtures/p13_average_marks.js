import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("marks", v.emptyList()),
    s.set("how_many", v.int(v.ask(t("How many tests? ")))),
    s.count("i", null, x("how_many"), [
      s.set("m", v.float(v.ask(t("Mark: ")))),
      s.addTo(x("m"), x("marks")),
    ]).blank(1),
    s.set("total", n(0)).blank(1),
    s.forEach("m", x("marks"), [s.set("total", v.add(x("total"), x("m")))]),
    s.set("average", v.div(x("total"), v.length(x("marks")))).blank(1),
    s.say(t("Average is"), x("average")),
    s.if([[v.ge(x("average"), 50), [s.say(t("You passed"))]]], [s.say(t("Try harder next time"))]).blank(1),
  ],
);
