import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { OpenRouter } from "@openrouter/ai-sdk-provider";
import { VectorStore } from "@/lib/vectorStore";

// Configure longer timeout for Vercel
export const config = {
  runtime: "edge",
  regions: ["iad1"], // Optimizes for US East (N. Virginia), can be changed as needed
};

// Simple agent to fetch and summarize web content
class WebSummaryAgent {
  private url: string;
  private html: string = "";
  private title: string = "";
  private mainText: string = "";
  private summary: string = "";

  constructor(url: string) {
    // Ensure URL has proper protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    this.url = url;
  }

  // Fetch HTML content from URL
  async fetchContent(): Promise<void> {
    try {
      const response = await fetch(this.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch webpage: ${response.statusText}`);
      }

      this.html = await response.text();
    } catch (error) {
      throw new Error(
        `Error fetching content: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Extract main content from HTML
  async extractContent(): Promise<void> {
    try {
      const $ = cheerio.load(this.html);

      // Get title
      this.title = $("title").text() || $("h1").first().text();

      // Extract main text, focusing on meaningful content areas
      // This prioritizes content in main article areas and removes scripts/styles
      const mainContentSelectors = [
        "article",
        "main",
        ".content",
        ".article",
        ".post",
        ".entry-content",
        "#content",
        '[role="main"]',
      ];

      let mainContent = "";

      // Try to get content from common content containers first
      for (const selector of mainContentSelectors) {
        if ($(selector).length) {
          mainContent = $(selector).text().trim();
          if (mainContent.length > 500) {
            break; // Found substantial content
          }
        }
      }

      // If no good content found in specific areas, fall back to body
      if (mainContent.length < 500) {
        // Remove scripts, styles, navigation, footers, headers, sidebars
        $(
          "script, style, nav, header, footer, aside, .sidebar, .nav, .menu, .ad, .ads, .advertisement"
        ).remove();
        mainContent = $("body").text();
      }

      // Clean the text by removing excess whitespace
      this.mainText = mainContent.replace(/\s+/g, " ").trim();
    } catch (error) {
      throw new Error(
        `Error extracting content: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Generate summary using AI
  async generateSummary(): Promise<void> {
    try {
      const prompt = `Summarize this webpage content concisely:

URL: ${this.url}
Title: ${this.title}

Content:
${this.mainText.substring(0, 8000)}

Create a brief, informative summary that captures the main points. Format in markdown.`;

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: "meta-llama/llama-3.3-70b-instruct:free",
            messages: [{ role: "user", content: prompt }],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to generate summary: ${response.statusText}`);
      }

      const data = await response.json();
      this.summary = data.choices[0].message.content;
    } catch (error) {
      throw new Error(
        `Error generating summary: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Run the complete process
  async run(): Promise<{
    html: string;
    title: string;
    mainText: string;
    summary: string;
  }> {
    await this.fetchContent();
    await this.extractContent();
    await this.generateSummary();

    return {
      html: this.html,
      title: this.title,
      mainText: this.mainText,
      summary: this.summary,
    };
  }
}

const vectorStore = new VectorStore();

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ message: "URL is required" }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch (error) {
      return NextResponse.json(
        { message: "Invalid URL format. Please provide a valid URL." },
        { status: 400 }
      );
    }

    // Process the URL
    const agent = new WebSummaryAgent(url);
    const result = await agent.run();

    // Store in vector database (don't block on errors)
    try {
      await vectorStore.initialize();
      await vectorStore.storeContent(url, {
        title: result.title,
        description: "",
        mainText: result.mainText,
        metadata: { topics: [], keyPoints: [], sentiment: "", entities: [] },
      });
    } catch (error) {
      console.error("Vector storage error (continuing anyway):", error);
    }

    // Return the results
    return NextResponse.json({
      summary: result.summary,
      rawHtml: result.html,
      cleanedText: result.mainText,
      title: result.title,
    });
  } catch (error) {
    console.error("Error processing request:", error);
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
