import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("fruits", v.listOf(t("apple"), t("banana"), t("cherry"))),
    s.say(x("fruits")),
    s.addTo(t("mango"), x("fruits")).blank(1),
    s.setItem(1, x("fruits"), t("grape")),
    s.set("last", v.method(x("fruits"), "pop")),
    s.say(t("I removed"), x("last")),
    s.say(t("First fruit:"), v.itemAt(0, x("fruits"))).blank(1),
    s.say(t("Number of fruits:"), v.length(x("fruits"))),
    s.if([[v.contains(x("fruits"), t("cherry")), [s.say(t("Cherry is still here"))]]]).blank(1),
  ],
);
