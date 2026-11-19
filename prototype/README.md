# SplitSmart Prototype (CIS 285 Lab 9)

A web app for sharing expenses within a group: create groups, add members, record
expenses split equally among selected participants, and see each member's balance.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 + SQLite.

## Running

```bash
cd prototype
# One-time: .env must contain DATABASE_URL="file:./dev.db" (same as the Dev Container template)
npx prisma db push     # create/update the SQLite schema (prisma/dev.db)
npm run dev            # http://localhost:3000
```

## Testing

```bash
npm test                               # unit tests (split + balance + money parsing)
node scripts/api-smoke-test.mjs        # end-to-end API checks; needs `npm run dev` running
```

## Design

| Layer | File |
|---|---|
| Pure domain logic: equal split, remainder cents, balances | `src/lib/splitting.ts` |
| Money parsing/formatting (integer cents, no floats) | `src/lib/money.ts` |
| Validation + persistence service | `src/lib/splitsmart.ts` |
| REST API | `src/app/api/groups/**/route.ts` |
| UI (single page, client component) | `src/app/SplitSmartApp.tsx` |
| Schema | `prisma/schema.prisma` |

API:

- `GET /api/groups`: list groups
- `POST /api/groups` `{ name }`: create a group
- `GET /api/groups/:id`: members, expense history, balances
- `POST /api/groups/:id/members` `{ name }`: add a member
- `POST /api/groups/:id/expenses` `{ description, amount, payerId, participantIds[] }`: record an expense

Business rules:

- Amounts are parsed from text straight to integer cents. They must be positive, have at most 2 decimals, and be at most $1,000,000.
- Each expense is split equally. Leftover cents go one at a time to the first participants in member join order, so a $10 split three ways is $3.34 / $3.33 / $3.33. Each member's share is stored when the expense is recorded.
- The payer and all participants must belong to the group. Participant IDs must not repeat.
- Balance = amount paid − amount owed. Because each expense's shares add up to its amount, the balances always sum to $0.00.
