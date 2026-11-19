// End-to-end check of the running SplitSmart API.
// Usage: node scripts/api-smoke-test.mjs [baseUrl]   (default http://localhost:3000)
const BASE = process.argv[2] ?? "http://localhost:3000";
let failures = 0;

function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures++;
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const balancesOf = (d) => Object.fromEntries(d.balances.map((b) => [b.member.name, b.balanceCents]));
const total = (d) => d.balances.reduce((s, b) => s + b.balanceCents, 0);

// FR1: create + list groups
const g = await call("POST", "/api/groups", { name: `Smoke Test ${Date.now()}` });
check("create group returns 201", g.status === 201, JSON.stringify(g.body));
const gid = g.body.id;
const list = await call("GET", "/api/groups");
check("group appears in group list", list.body.some((x) => x.id === gid));
check("empty group name rejected", (await call("POST", "/api/groups", { name: "  " })).status === 400);

// FR2: members
const ids = {};
for (const name of ["Alice", "Bob", "Charlie"]) {
  const r = await call("POST", `/api/groups/${gid}/members`, { name });
  check(`add member ${name}`, r.status === 201);
  ids[name] = r.body.id;
}
const dup = await call("POST", `/api/groups/${gid}/members`, { name: "alice" });
check("duplicate member name rejected", dup.status === 409, dup.body?.error);
let d = (await call("GET", `/api/groups/${gid}`)).body;
check("member list has 3 members", d.members.map((m) => m.name).join(",") === "Alice,Bob,Charlie");

const all = [ids.Alice, ids.Bob, ids.Charlie];

// FR3 + FR5: $60 paid by Alice
let r = await call("POST", `/api/groups/${gid}/expenses`, {
  description: "Dinner", amount: "60", payerId: ids.Alice, participantIds: all,
});
check("record $60 expense", r.status === 201);
d = (await call("GET", `/api/groups/${gid}`)).body;
check("$60 balances Alice +40, Bob -20, Charlie -20",
  JSON.stringify(balancesOf(d)) === JSON.stringify({ Alice: 4000, Bob: -2000, Charlie: -2000 }),
  JSON.stringify(balancesOf(d)));
check("balances sum to zero after $60", total(d) === 0 && d.balanceTotalCents === 0);

// Multiple expenses
r = await call("POST", `/api/groups/${gid}/expenses`, {
  description: "Taxi", amount: "30.00", payerId: ids.Bob, participantIds: [ids.Bob, ids.Charlie],
});
check("record $30 expense (Bob pays, Bob+Charlie)", r.status === 201);
d = (await call("GET", `/api/groups/${gid}`)).body;
check("after 2 expenses: Alice +40, Bob -5, Charlie -35",
  JSON.stringify(balancesOf(d)) === JSON.stringify({ Alice: 4000, Bob: -500, Charlie: -3500 }),
  JSON.stringify(balancesOf(d)));
check("balances sum to zero after 2 expenses", total(d) === 0);

// $10 / 3
r = await call("POST", `/api/groups/${gid}/expenses`, {
  description: "Coffee", amount: "10", payerId: ids.Charlie, participantIds: all,
});
check("record $10 expense split 3 ways", r.status === 201);
d = (await call("GET", `/api/groups/${gid}`)).body;
const coffee = d.expenses.find((e) => e.description === "Coffee");
const shares = coffee.participants.map((p) => p.shareCents);
check("$10/3 shares are 3.34, 3.33, 3.33", JSON.stringify(shares) === "[334,333,333]", JSON.stringify(shares));
check("$10/3 shares sum to exactly $10.00", shares.reduce((a, b) => a + b, 0) === 1000);
check("after 3 expenses: Alice +36.66, Bob -8.33, Charlie -28.33",
  JSON.stringify(balancesOf(d)) === JSON.stringify({ Alice: 3666, Bob: -833, Charlie: -2833 }),
  JSON.stringify(balancesOf(d)));
check("balances sum to zero after 3 expenses", total(d) === 0);

// FR4: history
check("history shows 3 expenses, newest first",
  d.expenses.map((e) => e.description).join(",") === "Coffee,Taxi,Dinner");

// Invalid input
const base = { description: "Bad", amount: "10", payerId: ids.Alice, participantIds: all };
const invalid = [
  ["zero amount", { ...base, amount: "0" }],
  ["negative amount", { ...base, amount: "-5" }],
  ["non-numeric amount", { ...base, amount: "abc" }],
  ["3-decimal amount", { ...base, amount: "1.234" }],
  ["missing amount", { ...base, amount: "" }],
  ["unknown payer id", { ...base, payerId: "not-a-member" }],
  ["unknown participant id", { ...base, participantIds: [ids.Alice, "not-a-member"] }],
  ["no participants", { ...base, participantIds: [] }],
  ["duplicate participants", { ...base, participantIds: [ids.Alice, ids.Alice] }],
  ["missing description", { ...base, description: " " }],
];
// A member from a different group must also be rejected.
const g2 = (await call("POST", "/api/groups", { name: `Other ${Date.now()}` })).body;
const outsider = (await call("POST", `/api/groups/${g2.id}/members`, { name: "Dave" })).body;
invalid.push(["payer from another group", { ...base, payerId: outsider.id }]);
invalid.push(["participant from another group", { ...base, participantIds: [ids.Alice, outsider.id] }]);
for (const [name, body] of invalid) {
  const res = await call("POST", `/api/groups/${gid}/expenses`, body);
  check(`rejects ${name}`, res.status === 400 && typeof res.body?.error === "string", res.body?.error);
}
check("rejects malformed JSON", (await call("POST", `/api/groups/${gid}/expenses`, "{oops")).status === 400);
check("unknown group returns 404", (await call("GET", "/api/groups/nope")).status === 404);
d = (await call("GET", `/api/groups/${gid}`)).body;
check("rejected expenses were not stored", d.expenses.length === 3);

console.log(`\nGroup id: ${gid}`);
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
