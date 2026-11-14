import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "../dsl.js";

export default program(
  [
    s.set("age", v.int(v.ask(t("Age: ")))),
    s.set("is_student", v.ask(t("Are you a student? (yes/no) "))),
    s.if([
      [v.lt(x("age"), 5), [s.set("price", n(0))]],
      [v.or(v.lt(x("age"), 16), v.eq(x("is_student"), t("yes"))), [s.set("price", n(5))]],
      [v.ge(x("age"), 65), [s.set("price", n(4))]],
    ], [s.set("price", n(10))]).blank(1),
    s.if([[v.eq(x("price"), 0), [s.say(t("Free entry!"))]]], [
      s.say(t("Your ticket costs"), x("price"), t("pounds")),
    ]).blank(1),
  ],
);
