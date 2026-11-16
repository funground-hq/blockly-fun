import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("shopping", v.emptyList()),
    s.forever([
      s.set("item", v.ask(t("Add an item (or type done): "))),
      s.if([[v.eq(x("item"), t("done")), [s.break()]]]),
      s.addTo(x("item"), x("shopping")),
    ]).blank(1),
    s.say(t("You need to buy"), v.length(x("shopping")), t("things:")).blank(1),
    s.forEach("thing", x("shopping"), [s.say(t("-"), x("thing"))]),
    s.if([[v.contains(x("shopping"), t("milk")), [s.say(t("Don't forget the milk!"))]]]).blank(1),
  ],
);
