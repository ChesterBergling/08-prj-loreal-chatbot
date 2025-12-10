/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Set initial message
chatWindow.textContent =
  "👋 Hello! I'm a friendly chatbot that helps people find skincare products that work best for them and create skincare routines. Ask me about skin type, products, or routines.";

/* Conversation history starts with the system message and grows each turn. */
const systemMessage = {
  role: "system",
  content:
    "You are a friendly chatbot specialized ONLY in L'Oréal products and skincare. Assume you have comprehensive, up-to-date knowledge of L'Oréal's global product portfolio and its owned brands (for example: L'Oréal Paris, Lancôme, Kiehl's, La Roche-Posay, Vichy, SkinCeuticals, CeraVe, Garnier, Maybelline, NYX Professional Makeup, Essie, Urban Decay, and other L'Oréal-owned lines). When answering, reference the specific L'Oréal brand and product line, typical product forms (cleanser, serum, sunscreen, spot treatment), and typical size/price ranges when helpful. Always take into account the user's budget and cost preferences when recommending products: offer options at low, mid, and premium price points when appropriate, and prefer products that match the user's stated budget. If the user hasn't provided a budget and asks for product recommendations, ask a short clarifying question about budget or price range. If you do not know a precise SKU or up-to-the-minute stock/price, say so and offer the closest equivalent L'Oréal product. If a user asks about topics unrelated to L'Oréal or skincare, politely decline: say you can only help with L'Oréal products and skincare and offer to redirect them back to skincare questions or L'Oréal product guidance.",
};
const conversation = [systemMessage];

/* Helper: append a message to the chat window */
function appendMessage(text, className = "assistant") {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  chatWindow.appendChild(el);
}

/* Helper: call OpenAI Chat Completions with a messages array. */
async function callOpenAI(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const model = "gpt-4o";
  const res = await fetch("https://cold-bird-18e0.meberso.workers.dev/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      frequency_penalty: 0,
      presence_penalty: 0,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

/* Helper: detect if the text is related to skincare */
function isSkincareTopic(text) {
  if (!text) return false;
  const s = text.toLowerCase();
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
    "product",
    "products",
    "best",
    "recommend",
    "which",
    "choose",
    "choice",
    "option",
    "loreal",
    "l'oréal",
    "garnier",
    "maybelline",
    "lancome",
    "kiehl",
    "la roche-posay",
    "vichy",
    "skinceuticals",
    "cerave",
    "nyx",
    "essie",
    "urban decay",
  ];
  return keywords.some((k) => s.includes(k));
}

/* Helper: detect budget preferences in user input */
function detectBudget(text) {
  if (!text) return null;
  const s = text.toLowerCase();
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

/* Helper: detect if the user is asking for a recommendation */
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

/* Helper: check if a budget has been mentioned in the conversation */
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
    // Ignore errors and assume no budget in conversation
  }
  return false;
}

/* Handle form submit */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = userInput.value.trim();

  if (!text) return;

  appendMessage(`You: ${text}`, "user");

  const userEntry = { role: "user", content: text };
  conversation.push(userEntry);

  if (isRecommendationRequest(text) && !hasBudgetInConversation()) {
    const clarify =
      "Do you have a budget or price range in mind for products (for example: affordable, mid-range, premium, or a specific amount like $20)?";
    appendMessage(clarify, "assistant");
    conversation.push({ role: "assistant", content: clarify });
    userInput.value = "";
    return;
  }

  if (!isSkincareTopic(text)) {
    const offTopicResponse =
      "I am unable to assist you in that regard. However, I am very happy to answer questions related to L'Oréal beauty products.";
    appendMessage(offTopicResponse, "assistant");
    conversation.push({ role: "assistant", content: offTopicResponse });
    userInput.value = "";
    return;
  }

  const typingEl = document.createElement("div");
  typingEl.className = "msg typing";
  typingEl.textContent = "...";
  chatWindow.appendChild(typingEl);

  callOpenAI(conversation)
    .then((assistantText) => {
      if (typingEl && typingEl.parentNode)
        typingEl.parentNode.removeChild(typingEl);

      if (assistantText) {
        appendMessage(assistantText, "assistant");
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
      if (typingEl && typingEl.parentNode)
        typingEl.parentNode.removeChild(typingEl);
      userInput.value = "";
    });
});