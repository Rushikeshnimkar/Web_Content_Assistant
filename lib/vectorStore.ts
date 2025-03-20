import { Pinecone } from "@pinecone-database/pinecone";

interface VectorMetadata {
  url: string;
  title: string;
  description: string;
  type: "content" | "metadata";
  section?: string;
  text: string;
}

interface ScoredMatch {
  score: number;
  metadata: VectorMetadata;
}

// Helper function to split text into chunks
function splitTextIntoChunks(text: string, chunkSize: number = 500): string[] {
  const chunks: string[] = [];

  // Split by sections first (double newlines)
  const sections = text.split(/\n\n+/);

  let currentChunk = "";

  for (const section of sections) {
    // If adding this section doesn't exceed chunk size
    if ((currentChunk + section).length <= chunkSize) {
      currentChunk += (currentChunk ? "\n\n" : "") + section;
    } else {
      // If current chunk is not empty, add it to chunks
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      // If the section itself is too large, split it further
      if (section.length > chunkSize) {
        // Split by sentences
        const sentences = section.split(/(?<=[.!?])\s+/);
        let sectionChunk = "";

        for (const sentence of sentences) {
          if ((sectionChunk + sentence).length <= chunkSize) {
            sectionChunk += (sectionChunk ? " " : "") + sentence;
          } else {
            if (sectionChunk) {
              chunks.push(sectionChunk);
            }
            sectionChunk = sentence;
          }
        }

        if (sectionChunk) {
          chunks.push(sectionChunk);
        }
      } else {
        // Start a new chunk with current section
        currentChunk = section;
      }
    }
  }

  // Add the last chunk if not empty
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export class VectorStore {
  private pinecone: Pinecone;
  private indexName: string;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || "",
    });
    this.indexName = "scrapewebsite";
  }

  async initialize() {
    // Check if index exists
    const indexes = await this.pinecone.listIndexes();
    const indexExists = indexes.indexes?.some(
      (index) => index.name === this.indexName
    );

    if (!indexExists) {
      console.log(`Creating index ${this.indexName}`);
      try {
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: 768, // Google text-embedding-004 has 768 dimensions
          metric: "cosine",
          spec: {
            serverless: {
              cloud: "aws",
              region: "us-west-1",
            },
          },
        });
        // Wait for index initialization
        console.log("Waiting for index to initialize...");
        await new Promise((resolve) => setTimeout(resolve, 30000));
      } catch (error) {
        console.error(`Error creating index ${this.indexName}:`, error);
        throw error;
      }
    }
  }

  private async getEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      console.warn("Attempted to get embedding for empty text");
      // Return a zero vector with the correct dimension
      return Array(768).fill(0);
    }

    // Limit text length to avoid token limits
    const trimmedText = text.length > 5000 ? text.substring(0, 5000) : text;

    // Use GoogleGenerativeAI directly for simplicity given package issues
    const apiKey = process.env.GOOGLE_API_KEY || "";

    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            model: "text-embedding-004",
            content: { parts: [{ text: trimmedText }] },
          }),
        }
      );

      if (!response.ok) {
        console.error(
          `Embedding API error: ${response.status} ${response.statusText}`
        );
        const errorData = await response.text();
        console.error(`Error details: ${errorData}`);
        throw new Error(`Failed to get embedding: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.embedding || !data.embedding.values) {
        console.error("Invalid embedding response:", data);
        throw new Error("Invalid embedding response");
      }

      return data.embedding.values;
    } catch (error) {
      console.error("Error getting embedding:", error);
      // Return a zero vector as fallback to avoid breaking the application
      return Array(768).fill(0);
    }
  }

  async storeContent(
    url: string,
    content: {
      title: string;
      description: string;
      mainText: string;
      metadata: {
        topics: string[];
        keyPoints: string[];
        sentiment: string;
        entities: string[];
      };
    }
  ) {
    const index = this.pinecone.index(this.indexName);

    try {
      // Split main content into chunks
      const chunks = splitTextIntoChunks(content.mainText);

      // Store each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunkEmbedding = await this.getEmbedding(chunks[i]);
        await index.upsert([
          {
            id: `${url}-main-${i}`,
            values: chunkEmbedding,
            metadata: {
              url,
              title: content.title,
              description: content.description,
              type: "content" as const,
              section: "main",
              text: chunks[i],
              chunkIndex: i,
            },
          },
        ]);
      }

      // Only store metadata if there's actual content
      // Skip storing empty metadata
      if (
        content.metadata.topics.length > 0 ||
        content.metadata.keyPoints.length > 0 ||
        content.metadata.sentiment ||
        content.metadata.entities.length > 0
      ) {
        // Store metadata vectors
        const metadataItems = [
          {
            id: `${url}-topics`,
            text: content.metadata.topics.join(", ") || "No topics available",
            section: "topics" as const,
          },
          {
            id: `${url}-keypoints`,
            text:
              content.metadata.keyPoints.join(", ") ||
              "No key points available",
            section: "keypoints" as const,
          },
          {
            id: `${url}-sentiment`,
            text: content.metadata.sentiment || "neutral",
            section: "sentiment" as const,
          },
          {
            id: `${url}-entities`,
            text:
              content.metadata.entities.join(", ") || "No entities available",
            section: "entities" as const,
          },
        ];

        for (const item of metadataItems) {
          // Skip empty texts
          if (
            item.text &&
            item.text !== "No topics available" &&
            item.text !== "No key points available" &&
            item.text !== "No entities available" &&
            item.text !== "neutral"
          ) {
            const embedding = await this.getEmbedding(item.text);
            await index.upsert([
              {
                id: item.id,
                values: embedding,
                metadata: {
                  url,
                  title: content.title,
                  description: content.description,
                  type: "metadata" as const,
                  section: item.section,
                  text: item.text,
                },
              },
            ]);
          }
        }
      }
    } catch (error) {
      console.error(`Error storing content for ${url}:`, error);
      // Continue with execution even if vectors can't be stored
      // This ensures the summary is still generated even if vector storage fails
    }
  }

  async queryContent(query: string, topK: number = 5): Promise<ScoredMatch[]> {
    const index = this.pinecone.index(this.indexName);
    const queryEmbedding = await this.getEmbedding(query);

    const results = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    return (results.matches || []).map((match: any) => ({
      score: match.score || 0,
      metadata: match.metadata as VectorMetadata,
    }));
  }
}
