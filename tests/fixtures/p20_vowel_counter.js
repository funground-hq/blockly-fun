import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("word", v.ask(t("Type a word: "))),
    s.set("count", n(0)),
    s.forEach("letter", v.method(x("word"), "lower"), [
      s.if([[v.contains(t("aeiou"), x("letter")), [s.set("count", v.add(x("count"), 1))]]]),
    ]).blank(1),
    s.say(t("There are"), x("count"), t("vowels in"), x("word")).blank(1),
    s.say(t("The word has"), v.length(x("word")), t("letters")),
  ],
);
