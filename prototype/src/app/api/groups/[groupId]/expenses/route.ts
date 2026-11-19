import { NextResponse } from "next/server";
import { recordExpense } from "@/lib/splitsmart";
import { errorResponse, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    const expense = await recordExpense(groupId, await readJson(request));
    return NextResponse.json({ id: expense.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
