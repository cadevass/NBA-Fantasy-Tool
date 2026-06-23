const WORKER_URL = import.meta.env.VITE_CF_WORKER_URL || "";

export async function callClaude(messages, systemOverride = null) {
  if (!WORKER_URL) {
    throw new Error("VITE_CF_WORKER_URL not set. Add it to your .env.local file.");
  }

  const { AI_SYSTEM_PROMPT } = await import("./league.js");

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemOverride || AI_SYSTEM_PROMPT,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Worker error ${response.status}: ${err}`);
  }

  const data = await response.json();

  // Use pre-extracted text if available, otherwise fall back
  return data._extractedText || data.content?.find(b => b.type === "text")?.text || "";
}
