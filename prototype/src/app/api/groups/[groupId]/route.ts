import { NextResponse } from "next/server";
import { getGroupDetail } from "@/lib/splitsmart";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params;
    return NextResponse.json(await getGroupDetail(groupId));
  } catch (e) {
    return errorResponse(e);
  }
}
