import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("heroes", v.listOf(t("a dragon"), t("a robot"), t("a tiny mouse"), t("a pirate"))),
    s.set("places", v.listOf(t("in a cave"), t("on the moon"), t("in a school"), t("under the sea"))),
    s.set("actions", v.listOf(t("ate a pizza"), t("found some treasure"), t("learned to dance"))),
    s.set("hero", v.method(x("random"), "choice", x("heroes"))).blank(1),
    s.set("place", v.method(x("random"), "choice", x("places"))),
    s.set("action", v.method(x("random"), "choice", x("actions"))),
    s.say(v.add(v.add(v.add(v.add(t("Once upon a time there was "), x("hero")), t(" ")), x("place")), t("."))).blank(1),
    s.say(v.add(v.add(t("One day it "), x("action")), t("."))),
    s.say(t("The end!")),
  ],
);
