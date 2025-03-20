import { NextRequest, NextResponse } from "next/server";
import { queryAgent } from "@/lib/queryAgent";

// Configure longer timeout for Vercel
export const config = {
  runtime: "edge",
  regions: ["iad1"], // Optimizes for US East (N. Virginia)
};

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
