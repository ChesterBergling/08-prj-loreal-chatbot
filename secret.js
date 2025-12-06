// secret.js

export function getOpenAIHeaders(env) {
  const apiKey = env.OPENAI_API_KEY; // Cloudflare Worker secret only

  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Set it with `npx wrangler secret put OPENAI_API_KEY`."
    );
  }

  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
}
