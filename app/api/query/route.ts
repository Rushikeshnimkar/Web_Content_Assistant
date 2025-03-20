import { NextRequest, NextResponse } from "next/server";
import { queryAgent } from "@/lib/queryAgent";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json(
        { message: "Query is required" },
        { status: 400 }
      );
    }

    // Use the direct queryAgent function
    const result = await queryAgent(query);

    // Return only what we need
    return NextResponse.json({
      answer: result.answer,
    });
  } catch (error) {
    console.error("Error processing query:", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
