"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

type MessageType = "system" | "user" | "assistant" | "raw-data";

interface Message {
  id: string;
  type: MessageType;
  content: string;
  title?: string;
  rawHtml?: string;
  cleanedText?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "system",
      content:
        "Welcome! Enter a URL to analyze or ask a question about previously analyzed content.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzedUrls, setAnalyzedUrls] = useState<string[]>([]);
  const [showRawDataId, setShowRawDataId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // Debug: Check for duplicate message IDs
    const messageIds = messages.map((m) => m.id);
    const duplicateIds = messageIds.filter(
      (id, index) => messageIds.indexOf(id) !== index
    );
    if (duplicateIds.length > 0) {
      console.warn("Duplicate message IDs found:", duplicateIds);
    }
  }, [messages]);

  const isValidUrl = (text: string) => {
    // If it contains spaces, it's likely a question, not a URL
    if (text.includes(" ")) {
      return false;
    }

    // Check if it contains a domain-like pattern
    const hasDomainPattern = /\w+\.\w{2,}/.test(text);

    if (!hasDomainPattern) {
      return false;
    }

    try {
      // Add protocol if not present
      if (!text.startsWith("http://") && !text.startsWith("https://")) {
        text = "https://" + text;
      }
      new URL(text);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    // Determine if input is a URL or a question
    if (isValidUrl(input)) {
      // Process as URL
      await processUrl(input);
    } else {
      // Process as question
      await processQuestion(input);
    }

    setLoading(false);
  };

  const processUrl = async (url: string) => {
    // Ensure URL has protocol
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    try {
      // Show thinking message with guaranteed unique ID
      const thinkingId = `thinking-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      setMessages((prev) => [
        ...prev,
        {
          id: thinkingId,
          type: "assistant",
          content: "Analyzing URL, please wait...",
        },
      ]);

      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate summary");
      }

      const data = await response.json();

      // Format a clean URL for display (remove protocol)
      const displayUrl = url.replace(/^https?:\/\//, "");

      // Replace thinking message with summary - fix to prevent duplicate summaries
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? {
                id: msg.id,
                type: "assistant",
                content: `# [${data.title || displayUrl}](${url})\n\n${
                  data.summary
                }`,
                title: data.title,
                rawHtml: data.rawHtml,
                cleanedText: data.cleanedText,
              }
            : msg
        )
      );

      // Add URL to analyzed URLs
      setAnalyzedUrls((prev) => {
        // Only add the URL if it's not already in the list
        if (!prev.includes(url)) {
          return [...prev, url];
        }
        return prev;
      });
    } catch (error) {
      // Add error message with guaranteed unique ID
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : "An unknown error occurred"
          }`,
        },
      ]);
    }
  };

  const processQuestion = async (question: string) => {
    if (analyzedUrls.length === 0) {
      // If no URLs have been analyzed, prompt user to enter a URL first
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "assistant",
          content:
            "I need to analyze a webpage first before I can answer questions. Please enter a URL like 'example.com' to start.",
        },
      ]);
      return;
    }

    try {
      // Show thinking message with guaranteed unique ID
      const thinkingId = `thinking-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      setMessages((prev) => [
        ...prev,
        {
          id: thinkingId,
          type: "assistant",
          content: "Thinking...",
        },
      ]);

      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: question }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to answer question");
      }

      const data = await response.json();

      // Replace thinking message with answer
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === thinkingId
            ? {
                id: msg.id,
                type: "assistant",
                content: data.answer,
              }
            : msg
        )
      );
    } catch (error) {
      // Add error message with guaranteed unique ID
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          type: "assistant",
          content: `Error: ${
            error instanceof Error ? error.message : "An unknown error occurred"
          }`,
        },
      ]);
    }
  };

  const toggleRawData = (id: string, dataType: "rawHtml" | "cleanedText") => {
    const message = messages.find((msg) => msg.id === id);

    if (!message || !message[dataType]) return;

    if (showRawDataId === id) {
      // Toggle off
      setShowRawDataId(null);

      // Remove raw data message
      setMessages((prev) =>
        prev.filter(
          (msg) => msg.id !== `${id}-rawHtml` && msg.id !== `${id}-cleanedText`
        )
      );
    } else {
      // Toggle on
      setShowRawDataId(id);

      // Create a unique ID using both the original message ID, the data type, and a timestamp
      const uniqueId = `${id}-${dataType}-${Date.now()}`;

      // Add a raw data message
      const dataMessage: Message = {
        id: uniqueId,
        type: "raw-data",
        content: message[dataType] || "",
      };

      // Replace existing raw data message or add new one
      setMessages((prev) => {
        // First remove any existing raw data messages for this message
        const filteredMessages = prev.filter(
          (msg) =>
            !msg.id.startsWith(`${id}-rawHtml`) &&
            !msg.id.startsWith(`${id}-cleanedText`)
        );

        // Find the index of the message after which to insert the raw data
        const insertIndex = filteredMessages.findIndex((msg) => msg.id === id);
        if (insertIndex >= 0) {
          const newMessages = [...filteredMessages];
          newMessages.splice(insertIndex + 1, 0, dataMessage);
          return newMessages;
        }
        return [...filteredMessages, dataMessage];
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="py-4 px-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h1 className="text-xl font-bold text-center text-gray-800 dark:text-gray-200">
          Web Content Assistant
        </h1>
      </header>

      {/* Main chat area */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg ${
                message.type === "user"
                  ? "bg-blue-100 dark:bg-blue-900 ml-auto"
                  : message.type === "system"
                  ? "bg-gray-100 dark:bg-gray-800"
                  : message.type === "raw-data"
                  ? "bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                  : "bg-white dark:bg-gray-800"
              } ${message.type === "user" ? "max-w-md ml-auto" : "max-w-2xl"}`}
            >
              {message.type === "raw-data" ? (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {message.id.includes("rawHtml")
                        ? "Raw HTML"
                        : "Cleaned Text"}
                    </h3>
                    <div className="text-xs text-gray-500">
                      {message.content.length} characters
                    </div>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-96">
                    <pre className="text-xs whitespace-pre-wrap break-words">
                      {message.content}
                    </pre>
                  </div>
                </div>
              ) : (
                <>
                  <div className="prose dark:prose-invert">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>

                  {/* Data toggle buttons for summary responses */}
                  {message.rawHtml && message.cleanedText && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex space-x-2">
                      <button
                        onClick={() => toggleRawData(message.id, "rawHtml")}
                        className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                      >
                        {showRawDataId === message.id &&
                        messages.some((m) =>
                          m.id.startsWith(`${message.id}-rawHtml`)
                        )
                          ? "Hide Raw HTML"
                          : "View Raw HTML"}
                      </button>
                      <button
                        onClick={() => toggleRawData(message.id, "cleanedText")}
                        className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                      >
                        {showRawDataId === message.id &&
                        messages.some((m) =>
                          m.id.startsWith(`${message.id}-cleanedText`)
                        )
                          ? "Hide Cleaned Text"
                          : "View Cleaned Text"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input area */}
      <footer className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                analyzedUrls.length > 0
                  ? "Ask a question about the analyzed content..."
                  : "Enter a URL to analyze (e.g., example.com)"
              }
              className="flex-1 bg-transparent focus:outline-none text-gray-700 dark:text-gray-200"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                "Send"
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            {analyzedUrls.length > 0
              ? `Analyzed URLs: ${analyzedUrls.join(", ")}`
              : "Enter a URL first to analyze content"}
          </p>
        </form>
      </footer>
    </div>
  );
}
