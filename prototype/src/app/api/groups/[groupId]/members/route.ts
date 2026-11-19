import { NextResponse } from "next/server";
import { addMember } from "@/lib/splitsmart";
import { errorResponse, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    return NextResponse.json(await addMember(groupId, await readJson(request)), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
