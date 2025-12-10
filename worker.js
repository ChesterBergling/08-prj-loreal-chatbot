// worker.js
import { getOpenAIHeaders } from "./secret.js";

export default {
  async fetch(request, env, ctx) {
    try {
      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      // Get user message from POST body or ?q=
      let userMessage = "Answer only questions about L'Oréal beauty products.";
      const url = new URL(request.url);

      if (request.method === "POST") {
        try {
          const body = await request.json();
          if (body && typeof body.message === "string" && body.message.trim()) {
            userMessage = body.message.trim();
          }
        } catch (e) {
          // ignore bad JSON, use default
        }
      } else {
        const q = url.searchParams.get("q");
        if (q && q.trim()) {
          userMessage = q.trim();
        }
      }

      const headers = getOpenAIHeaders(env);

      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a L'Oréal beauty assistant. " +
                "Only answer questions related to L'Oréal, beauty, skincare, haircare, and makeup. " +
                "If the user asks about unrelated topics (e.g., the Andes), " +
                "politely refuse and redirect to L'Oréal/beauty questions.",
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
        }),
      });

      const data = await openAiRes.json().catch(() => ({}));

      if (!openAiRes.ok) {
        const msg =
          (data && (data.error?.message || JSON.stringify(data))) ||
          `OpenAI error with status ${openAiRes.status}`;
        return new Response(`Upstream error: ${msg}`, {
          status: openAiRes.status,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const answer =
        data?.choices?.[0]?.message?.content ??
        "I’m here to help with L'Oréal beauty questions.";

      return new Response(answer, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(`Worker error: ${err.message}`, {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
