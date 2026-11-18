import assert from "node:assert/strict";
import { test } from "node:test";

import { PRIORITY_DOT, PRIORITY_STYLE, TOPIC_PRIORITIES } from "../src/lib/topicPriority.ts";

test("ogni priorità ha un pallino e un riquadro", () => {
  // Il giorno in cui si aggiunge una quarta priorità, questo test cade prima
  // che un argomento compaia nell'elenco senza colore.
  for (const priority of TOPIC_PRIORITIES) {
    assert.ok(PRIORITY_DOT[priority], `manca il pallino di ${priority}`);
    assert.ok(PRIORITY_STYLE[priority], `manca il riquadro di ${priority}`);
  }
  assert.equal(Object.keys(PRIORITY_DOT).length, TOPIC_PRIORITIES.length);
  assert.equal(Object.keys(PRIORITY_STYLE).length, TOPIC_PRIORITIES.length);
});

test("i colori arrivano dai token, non da valori scritti a mano", () => {
  for (const value of [...Object.values(PRIORITY_DOT), ...Object.values(PRIORITY_STYLE)]) {
    assert.ok(
      !/#[0-9A-Fa-f]{3,8}\b/.test(value),
      `colore scritto a mano in «${value}»: va usato un token`
    );
  }
});
