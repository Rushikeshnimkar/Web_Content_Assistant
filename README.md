# Web Summary Agent

A Next.js application that uses AI to summarize web content. This agent can analyze any URL, extract key information, and generate concise summaries.

## Features

- Accept any URL as input
- Retrieve and analyze web page content
- Extract key information from the page
- Generate concise summaries
- Two agent modes:
  - Basic agent: Direct summarization using LangChain
  - Advanced agent: Multi-step analysis using LangGraph workflow

## Technologies Used

- [Next.js](https://nextjs.org/) - React framework for web applications
- [LangChain](https://js.langchain.com/docs/) - Framework for building LLM applications
- [LangGraph](https://js.langchain.com/docs/langgraph) - Tool for building agent workflows
- [OpenRouter](https://openrouter.ai/) - API gateway for accessing LLMs
- [Cheerio](https://cheerio.js.org/) - Web scraping library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- OpenRouter API key

### Installation

1. Clone this repository

```bash
git clone https://github.com/yourusername/web-summary-agent.git
cd web-summary-agent
```

2. Install dependencies

```bash
npm install
# or
yarn install
```

3. Create a `.env.local` file from the example

```bash
cp .env.local.example .env.local
```

4. Add your OpenRouter API key to the `.env.local` file

```
OPENROUTER_API_KEY=your_api_key_here
```

### Running the Application

```bash
npm run dev
# or
yarn dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## How It Works

1. **Basic Agent** (`/api/summarize`):

   - Uses CheerioWebBaseLoader to fetch web content
   - Splits content into manageable chunks
   - Sends content to LLM for summarization via OpenRouter
   - Returns the summary

2. **Advanced Agent** (`/api/agent`):
   - Uses LangGraph to create a multi-step workflow:
     1. Content Extraction: Fetches and processes web content
     2. Content Analysis: Analyzes and structures the content
     3. Key Points Extraction: Identifies the most important information
     4. Summary Generation: Creates a well-structured summary
   - Returns both the summary and key points

## License

This project is licensed under the MIT License - see the LICENSE file for details.
