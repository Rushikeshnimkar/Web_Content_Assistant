import { VectorStore } from "./vectorStore";

// Initialize the vector store
const vectorStore = new VectorStore();

/**
 * Main query function to answer questions about content
 */
export async function queryAgent(
  question: string
): Promise<{ answer: string }> {
  try {
    // Step 1: Initialize the vector store
    await vectorStore.initialize();

    // Step 2: Retrieve relevant content
    const results = await vectorStore.queryContent(question, 5);

    // Step 3: If no context, return early
    if (!results || results.length === 0) {
      return {
        answer:
          "I don't have enough information to answer this question. Please analyze some web content first.",
      };
    }

    // Step 4: Format the context
    const formattedContext = results
      .map((item, index) => {
        return `[${index + 1}] Source: ${item.metadata.title} (${
          item.metadata.url
        })
Content: ${item.metadata.text}`;
      })
      .join("\n\n");

    // Step 5: Generate the answer using OpenRouter API
    const prompt = `
You are an AI web analysis agent designed to answer questions based on extracted web content.

Context information is below:
---
${formattedContext}
---

Given the context information and no prior knowledge, answer the following question:
${question}

If you don't know the answer, just say "I don't have enough information to answer this question." Don't try to make up an answer.
Provide a detailed and informative response.
Format your answer in markdown.
`;

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
      throw new Error(`Error from OpenRouter API: ${response.statusText}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    // Return just the answer
    return { answer };
  } catch (error) {
    console.error("Error in queryAgent:", error);
    return {
      answer:
        "Sorry, I encountered an error while trying to answer your question.",
    };
  }
}
