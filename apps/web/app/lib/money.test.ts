// Run: node --experimental-strip-types apps/web/app/lib/money.test.ts
import assert from "node:assert/strict";
import { docNumber, fmtINR, parseScaled, toMilliPct, toPaise } from "./money.ts";

assert.equal(toPaise("13457"), 1345700);
assert.equal(toPaise("13,457"), 1345700);
assert.equal(toPaise("₹13,457.00"), 1345700);
assert.equal(toPaise("0.5"), 50);
assert.equal(toPaise(".05"), 5);
assert.equal(toPaise("1.234"), null);
assert.equal(toPaise("abc"), null);
assert.equal(toPaise(""), null);
assert.equal(toMilliPct("3"), 3000);
assert.equal(toMilliPct("0.125"), 125);
assert.equal(parseScaled("31.37", 3), 31370);
assert.equal(fmtINR(44611900), "₹4,46,119.00");
assert.equal(docNumber("SJ/", true, 4, 148, new Date("2026-11-18T00:00:00Z")), "SJ/26-27/0148");
assert.equal(docNumber("SJ/", true, 4, 148, new Date("2027-03-31T18:00:00Z")), "SJ/26-27/0148"); // still 31 Mar IST
assert.equal(docNumber("SJ/", true, 4, 148, new Date("2027-03-31T19:00:00Z")), "SJ/27-28/0148"); // 1 Apr 00:30 IST
assert.equal(docNumber("", false, 3, 7), "007");
console.log("money ok");
