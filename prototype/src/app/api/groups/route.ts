import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/lib/splitsmart";
import { errorResponse, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listGroups());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createGroup(await readJson(request)), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
