/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Initial assistant context shown to the user
function appendMessage(text, className = "assistant") {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  chatWindow.appendChild(el);
}

// Chat context in OpenAI chat format (system role)
const systemMessage = {
  role: "system",
  content:
    "You are a friendly chatbot specialized ONLY in L'Oréal products and skincare. Assume you have comprehensive, up-to-date knowledge of L'Oréal's global product portfolio and its owned brands (for example: L'Oréal Paris, Lancôme, Kiehl's, La Roche-Posay, Vichy, SkinCeuticals, CeraVe, Garnier, Maybelline, NYX Professional Makeup, Essie, Urban Decay, and other L'Oréal-owned lines). When answering, reference the specific L'Oréal brand and product line, typical product forms (cleanser, serum, sunscreen, spot treatment), and typical size/price ranges when helpful. Always take into account the user's budget and cost preferences when recommending products: offer options at low, mid, and premium price points when appropriate, and prefer products that match the user's stated budget. If the user hasn't provided a budget and asks for product recommendations, ask a short clarifying question about budget or price range. If you do not know a precise SKU or up-to-the-minute stock/price, say so and offer the closest equivalent L'Oréal product. If a user asks about topics unrelated to L'Oréal or skincare, politely decline: say you can only help with L'Oréal products and skincare and offer to redirect them back to skincare questions or L'Oréal product guidance.",
};

// Reusable refusal template used when the assistant must decline non-L'Oréal topics
const refusalTemplate =
  "I'm only able to help with L'Oréal products and skincare. If you have questions about L'Oréal brands, specific products, or skincare routines, please ask and I’ll be happy to help. Otherwise I can't assist with non-L'Oréal topics.";

// Display the assistant intro locally as well
appendMessage(
  "👋 Hello! I'm a friendly chatbot that helps people find skincare products that work best for them and create skincare routines. Ask me about skin type, products, or routines.",
  "assistant-intro"
);

// Conversation history starts with the system message and grows each turn.
const conversation = [systemMessage];

/* Very small, keyword-based on-topic detector for skincare. This is a simple
   client-side heuristic used only for a friendly fallback when the user asks
   about unrelated topics. For production, use server-side intent classification. */
function isSkincareTopic(text) {
  if (!text) return false;
  const s = text.toLowerCase();

  // Expand keywords to include product-followup words so questions like
  // "which is best" or "out of the four products" are detected as on-topic.
  const keywords = [
    "skin",
    "skincare",
    "acne",
    "moistur",
    "sunscreen",
    "spf",
    "cleanser",
    "serum",
    "routine",
    "hydration",
    "dry",
    "oily",
    "sensitive",
    "anti-aging",
    "age",
    "tone",
    "pigment",
    "rosacea",
    "eczema",
    // product/follow-up related
    "product",
    "products",
    "best",
    "recommend",
    "which",
    "choose",
    "choice",
    "option",
    // L'Oréal specific keywords/brands — treat as on-topic
    "loreal",
    "l'oréal",
    "loreal paris",
    "lorealparis",
    "loreal profession",
    "loreal professionnel",
    "garnier",
    "maybelline",
    "lancome",
    "lancôme",
    "kiehl",
    "kiehl's",
    "la roche-posay",
    "laroche-posay",
    "vichy",
    "skinceuticals",
    "cerave",
    "nyx",
    "essie",
    "urban decay",
  ];

  // If the current text contains any keyword, it's on-topic.
  if (keywords.some((k) => s.includes(k))) return true;

  // Also check recent conversation: if previous turns mention skincare or
  // product recommendations, treat this follow-up as on-topic.
  try {
    if (typeof conversation !== "undefined" && Array.isArray(conversation)) {
      const joined = conversation
        .slice(-6)
        .map((m) => (m.content || "").toLowerCase())
        .join(" ");
      if (keywords.some((k) => joined.includes(k))) return true;
    }
  } catch (e) {
    // ignore and fallback to keyword-only detection
  }

  return false;
}

// Spelling correction removed: the app will accept user input verbatim.

/* Budget detection: looks for common budget words or explicit price mentions.
   Returns a simple object when a budget is found, or null otherwise. */
function detectBudget(text) {
  if (!text) return null;
  const s = text.toLowerCase();

  // keywords indicating budget preference
  const cheapWords = [
    "cheap",
    "budget",
    "afford",
    "affordable",
    "low-cost",
    "inexpensive",
  ];
  const midWords = ["mid", "mid-range", "moderate", "medium"];
  const highWords = ["expensive", "luxury", "premium", "high-end", "splurge"];

  for (const w of cheapWords) if (s.includes(w)) return { level: "low" };
  for (const w of midWords) if (s.includes(w)) return { level: "mid" };
  for (const w of highWords) if (s.includes(w)) return { level: "high" };

  // Simple currency/number detection, e.g. "$20", "20$", "under $30", "< $50", "20-30"
  const currencyMatch = s.match(/\$\s?\d+|\d+\s?\$/);
  if (currencyMatch) {
    const numMatch = currencyMatch[0].replace(/[^0-9]/g, "");
    const value = parseInt(numMatch, 10);
    if (!isNaN(value)) return { level: "custom", amount: value, currency: "$" };
  }

  const rangeMatch = s.match(/(under|below)\s*\$?\s*(\d+)/);
  if (rangeMatch) {
    const value = parseInt(rangeMatch[2], 10);
    if (!isNaN(value)) return { level: "custom", max: value, currency: "$" };
  }

  return null;
}

function hasBudgetInConversation() {
  try {
    if (!conversation || !Array.isArray(conversation)) return false;
    for (
      let i = conversation.length - 1;
      i >= Math.max(0, conversation.length - 8);
      i--
    ) {
      const m = conversation[i];
      if (!m || !m.content) continue;
      if (detectBudget(m.content)) return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

function isRecommendationRequest(text) {
  if (!text) return false;
  const s = text.toLowerCase();
  const recKeywords = [
    "recommend",
    "best",
    "which",
    "choose",
    "choice",
    "suggest",
    "out of",
  ];
  return recKeywords.some((k) => s.includes(k));
}

/* Helper: call OpenAI Chat Completions with a messages array. */
async function callOpenAI(messages) {
  // Basic safety: ensure messages is an array and system message present
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  // Model to use — change if you prefer another model
  const model = "gpt-4o";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      // Generation parameters
      temperature: 0.5,
      // "Word penalty" mapped to frequency and presence penalties set to 0
      frequency_penalty: 0,
      presence_penalty: 0,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${txt}`);
  }

  const data = await res.json();
  // Expect data.choices[0].message.content
  const assistantMessage = data?.choices?.[0]?.message?.content;
  return assistantMessage;
}

/* Helper to mask the API key when showing confirmation in the UI */
function maskKey(key) {
  if (!key || key.length < 8) return "••••••";
  const first = key.slice(0, 4);
  const last = key.slice(-4);
  return `${first}••••••${last}`;
}

/* Make sure secrets.js exposes apiKey before using it in the browser.
   Note: Storing a secret in client-side JS is insecure. Prefer a server or
   Cloudflare Worker proxy for real deployments. */
let API_KEY_AVAILABLE = false;
if (typeof apiKey === "undefined") {
  // Do not expose key status to the user UI. Log to console for developers.
  console.info("apiKey not found. Running in demo mode.");
  API_KEY_AVAILABLE = false;
} else {
  // Masked key logged only to the console for developer inspection.
  console.info(`apiKey: ${maskKey(apiKey)}`);
  API_KEY_AVAILABLE = true;
}

/* Handle form submit */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = userInput.value.trim();

  if (!text) return;

  // Spellchecking removed: accept and display user input verbatim
  appendMessage(`You: ${text}`, "user");

  const userEntry = { role: "user", content: text };
  conversation.push(userEntry);

  // If the user is explicitly asking for a recommendation but hasn't
  // specified a budget, ask a short clarifying question before calling the API.
  if (isRecommendationRequest(text) && !hasBudgetInConversation()) {
    const clarify =
      "Do you have a budget or price range in mind for products (for example: affordable, mid-range, premium, or a specific amount like $20)?";
    appendMessage(clarify, "assistant");
    conversation.push({ role: "assistant", content: clarify });
    userInput.value = "";
    return;
  }

  // Off-topic fallback: if the user asks about something outside L'Oréal/skincare,
  // use the standard refusal template and record that response.
  if (!isSkincareTopic(text)) {
    appendMessage(refusalTemplate, "assistant");
    conversation.push({ role: "assistant", content: refusalTemplate });
    userInput.value = "";
    return;
  }

  // If API key not available, run in demo mode (don't show internal debug info)
  if (!API_KEY_AVAILABLE) {
    appendMessage(
      "Demo mode: no API key configured. I can still help with skincare advice, but live API responses are disabled.",
      "assistant"
    );
    userInput.value = "";
    return;
  }

  // Call OpenAI using the full conversation history
  // Show a lightweight typing indicator while waiting for the model
  const typingEl = document.createElement("div");
  typingEl.className = "msg typing";
  typingEl.textContent = "...";
  chatWindow.appendChild(typingEl);

  callOpenAI(conversation)
    .then((assistantText) => {
      // remove typing indicator if still present
      if (typingEl && typingEl.parentNode)
        typingEl.parentNode.removeChild(typingEl);

      if (assistantText) {
        appendMessage(assistantText, "assistant");
        // Save assistant response into conversation history
        conversation.push({ role: "assistant", content: assistantText });
      } else {
        appendMessage("No response from the model.", "assistant");
      }
    })
    .catch((err) => {
      if (typingEl && typingEl.parentNode)
        typingEl.parentNode.removeChild(typingEl);
      appendMessage(`Error: ${err.message}`, "error");
    })
    .finally(() => {
      // ensure typing indicator removed and clear input
      if (typingEl && typingEl.parentNode)
        typingEl.parentNode.removeChild(typingEl);
      userInput.value = "";
    });
});
