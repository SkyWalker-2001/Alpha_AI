import type { ToolDef } from "../types.js";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const webFetchTool: ToolDef = {
  name: "web_fetch",
  description:
    "Fetch a URL and return its text content (HTML is stripped to readable text). Use to read documentation, articles, or APIs.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The absolute URL to fetch (http/https)." },
    },
    required: ["url"],
  },
  async run(args) {
    try {
      const url = String(args.url);
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (AlphaAI agent)" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return { content: `web_fetch: HTTP ${res.status} for ${url}`, isError: true };
      const ct = res.headers.get("content-type") || "";
      const raw = await res.text();
      const text = ct.includes("html") ? htmlToText(raw) : raw;
      const body = text.length > 40_000 ? text.slice(0, 40_000) + "\n...[truncated]" : text;
      return { content: body || "(empty response)" };
    } catch (e) {
      return { content: `web_fetch error: ${String(e)}`, isError: true };
    }
  },
};

export const webSearchTool: ToolDef = {
  name: "web_search",
  description:
    "Search the web and return a list of result titles, URLs, and snippets. Use before web_fetch when you don't already know the URL.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
  },
  async run(args) {
    try {
      const q = encodeURIComponent(String(args.query));
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
        headers: { "User-Agent": "Mozilla/5.0 (AlphaAI agent)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return { content: `web_search: HTTP ${res.status}`, isError: true };
      const html = await res.text();
      const results: string[] = [];
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && results.length < 8) {
        let url = m[1];
        const title = htmlToText(m[2]);
        // DuckDuckGo wraps links in a redirect; extract the real target.
        const uddg = url.match(/uddg=([^&]+)/);
        if (uddg) url = decodeURIComponent(uddg[1]);
        if (title) results.push(`- ${title}\n  ${url}`);
      }
      return {
        content: results.length ? results.join("\n") : "No results found.",
      };
    } catch (e) {
      return { content: `web_search error: ${String(e)}`, isError: true };
    }
  },
};
