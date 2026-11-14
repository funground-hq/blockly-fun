import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("name", v.ask(t("Enter a name: "))),
    s.set("animal", v.ask(t("Enter an animal: "))),
    s.set("food", v.ask(t("Enter a food: "))),
    s.set("number", v.ask(t("Enter a number: "))),
    s.say().blank(1),
    s.say(x("name"), t("went to the zoo and saw"), x("number"), v.add(x("animal"), t("s."))),
    s.say(t("They all wanted to eat"), v.add(x("food"), t("."))),
    s.say(x("name"), t("ran away very fast!")),
  ],
);
