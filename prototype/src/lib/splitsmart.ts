/** Application service: validation + persistence for SplitSmart. */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { MAX_AMOUNT_CENTS, parseAmountToCents } from "./money";
import { calculateBalances, splitEqually } from "./splitting";
import type { GroupDetail, GroupSummary, MemberDto } from "./types";

export class ValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

const MAX_NAME = 80;
const MAX_DESCRIPTION = 200;

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} is required.`);
  }
  const text = value.trim();
  if (text.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return text;
}

export async function listGroups(): Promise<GroupSummary[]> {
  const groups = await prisma.group.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true, expenses: true } } },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g._count.members,
    expenseCount: g._count.expenses,
  }));
}

export async function createGroup(input: { name?: unknown }): Promise<GroupSummary> {
  const name = requireText(input.name, "Group name", MAX_NAME);
  const g = await prisma.group.create({ data: { name } });
  return { id: g.id, name: g.name, memberCount: 0, expenseCount: 0 };
}

async function requireGroup(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new ValidationError("Group not found.", 404);
  return group;
}

async function orderedMembers(groupId: string) {
  return prisma.member.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function addMember(groupId: string, input: { name?: unknown }): Promise<MemberDto> {
  await requireGroup(groupId);
  const name = requireText(input.name, "Member name", MAX_NAME);
  const existing = await prisma.member.findMany({ where: { groupId } });
  if (existing.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
    throw new ValidationError(`A member named "${name}" already exists in this group.`, 409);
  }
  try {
    const m = await prisma.member.create({ data: { groupId, name } });
    return { id: m.id, name: m.name };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ValidationError(`A member named "${name}" already exists in this group.`, 409);
    }
    throw e;
  }
}

export async function recordExpense(
  groupId: string,
  input: { description?: unknown; amount?: unknown; payerId?: unknown; participantIds?: unknown },
) {
  await requireGroup(groupId);
  const description = requireText(input.description, "Description", MAX_DESCRIPTION);

  if (input.amount === undefined || input.amount === null || String(input.amount).trim() === "") {
    throw new ValidationError("Amount is required.");
  }
  if (/^\s*-/.test(String(input.amount))) throw new ValidationError("Amount must be greater than zero.");
  const amountCents = parseAmountToCents(input.amount);
  if (amountCents === null) {
    throw new ValidationError("Amount must be a number with at most two decimal places (e.g. 12.50).");
  }
  if (amountCents <= 0) throw new ValidationError("Amount must be greater than zero.");
  if (amountCents > MAX_AMOUNT_CENTS) throw new ValidationError("Amount must not exceed $1,000,000.00.");

  const members = await orderedMembers(groupId);
  const memberIds = new Set(members.map((m) => m.id));

  if (typeof input.payerId !== "string" || input.payerId === "") {
    throw new ValidationError("Please select who paid.");
  }
  if (!memberIds.has(input.payerId)) throw new ValidationError("The payer must be a member of this group.");
  const payerId = input.payerId;

  if (!Array.isArray(input.participantIds) || input.participantIds.length === 0) {
    throw new ValidationError("Select at least one participant.");
  }
  if (!input.participantIds.every((id): id is string => typeof id === "string")) {
    throw new ValidationError("Participant IDs must be strings.");
  }
  const selected = new Set(input.participantIds);
  if (selected.size !== input.participantIds.length) {
    throw new ValidationError("Each participant may be selected only once.");
  }
  const unknown = [...selected].filter((id) => !memberIds.has(id));
  if (unknown.length > 0) {
    throw new ValidationError("All participants must be members of this group.");
  }

  // Stable order (member join order) makes remainder-cent allocation deterministic.
  const ordered = members.filter((m) => selected.has(m.id)).map((m) => m.id);
  const shares = splitEqually(amountCents, ordered);

  return prisma.expense.create({
    data: {
      groupId,
      description,
      amountCents,
      payerId,
      participants: { create: shares.map((s) => ({ memberId: s.memberId, shareCents: s.shareCents })) },
    },
  });
}

export async function getGroupDetail(groupId: string): Promise<GroupDetail> {
  const group = await requireGroup(groupId);
  const members = await orderedMembers(groupId);
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { payer: true, participants: { include: { member: true } } },
  });

  const balances = calculateBalances(
    members.map((m) => m.id),
    expenses.map((e) => ({ payerId: e.payerId, amountCents: e.amountCents, shares: e.participants })),
  );
  const memberOrder = new Map(members.map((m, i) => [m.id, i]));
  const dto = (m: { id: string; name: string }): MemberDto => ({ id: m.id, name: m.name });

  const balanceList = members.map((m) => ({ member: dto(m), balanceCents: balances.get(m.id) ?? 0 }));
  return {
    id: group.id,
    name: group.name,
    members: members.map(dto),
    expenses: expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      payer: dto(e.payer),
      participants: [...e.participants]
        .sort((a, b) => (memberOrder.get(a.memberId) ?? 0) - (memberOrder.get(b.memberId) ?? 0))
        .map((p) => ({ member: dto(p.member), shareCents: p.shareCents })),
      createdAt: e.createdAt.toISOString(),
    })),
    balances: balanceList,
    balanceTotalCents: balanceList.reduce((sum, b) => sum + b.balanceCents, 0),
  };
}
