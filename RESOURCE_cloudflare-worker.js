// This worker receives a POST request, sends it to Mistral, and returns the response with CORS headers

async function handleRequest(request, env) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Content-Type": "application/json",
  };

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    console.log("Preflight request received");
    return new Response(null, { headers: corsHeaders });
}

  if (request.method === "GET") {
    // Handle simple GET requests for CORS testing
    return new Response(
      JSON.stringify({
        status: "ok",
        message: "CORS headers are working!",
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Get your API key from the environment variable
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not set" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Parse the incoming JSON body
  let userInput;
  try {
    userInput = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Send the request to Mistral's API
  const apiResponse = await fetch(
    "https://api.mistral.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userInput),
    }
  );

  const data = await apiResponse.text();

  return new Response(data, {
    status: apiResponse.status,
    headers: corsHeaders,
  });
}

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request, event.env));
});
