/** JSON shapes shared by the API routes and the UI. */

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
  expenseCount: number;
}

export interface MemberDto {
  id: string;
  name: string;
}

export interface ExpenseDto {
  id: string;
  description: string;
  amountCents: number;
  payer: MemberDto;
  participants: { member: MemberDto; shareCents: number }[];
  createdAt: string;
}

export interface BalanceDto {
  member: MemberDto;
  balanceCents: number;
}

export interface GroupDetail {
  id: string;
  name: string;
  members: MemberDto[];
  expenses: ExpenseDto[];
  balances: BalanceDto[];
  balanceTotalCents: number;
}
