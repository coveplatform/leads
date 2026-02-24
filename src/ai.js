// AI-powered flow generation and smart reply parsing
// Uses OpenAI GPT-4o-mini for cost efficiency (~$0.001 per call)

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function getApiKey() {
  return process.env.OPENAI_API_KEY || "";
}

async function callOpenAI(messages, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || "gpt-4o-mini",
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1500,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Generate Flow for Industry ───

export async function generateFlowForIndustry(industry, businessName, extraContext) {
  const prompt = `You are a lead qualification expert. Generate an SMS qualification flow for a ${industry} business${businessName ? ` called "${businessName}"` : ""}.

${extraContext ? `Additional context: ${extraContext}` : ""}

The flow must have exactly 3 questions. Each question should help the business owner:
1. Understand urgency (should I call back NOW or later?)
2. Understand what the customer needs (type of job/service)
3. Know when to contact them (timing preference)

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "intro": "Hi {firstName}, this is {businessName}. [short intro message]",
  "completion": "Thanks! {businessName} will [action] shortly.",
  "completion_with_booking": "Thanks! {businessName} will [action] shortly. Or book here: {bookingLink}",
  "steps": [
    {
      "id": "step_key",
      "key": "step_key",
      "question": "Question text with options\\nA) Option 1\\nB) Option 2\\nC) Option 3",
      "invalid_text": "Please reply A, B or C.",
      "options": [
        { "value": "A", "label": "Human readable label" },
        { "value": "B", "label": "Human readable label" },
        { "value": "C", "label": "Human readable label" }
      ],
      "urgent_values": ["A"],
      "free_text": false
    }
  ]
}

Rules:
- Use A/B/C letters OR 1/2/3/4/5 numbers for options (not both in same question)
- Keep questions SHORT — these are SMS messages
- urgent_values array: which option values indicate urgency (triggers instant owner alert)
- The intro MUST contain {firstName} and {businessName} placeholders
- The completion MUST contain {businessName} placeholder
- completion_with_booking MUST contain {businessName} and {bookingLink}
- Make questions industry-specific and natural
- free_text should be false for all structured questions`;

  const raw = await callOpenAI([{ role: "user", content: prompt }], {
    temperature: 0.6,
  });

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const flow = JSON.parse(cleaned);

    if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
      throw new Error("Invalid flow: no steps");
    }

    for (const step of flow.steps) {
      if (!step.id) step.id = step.key;
      if (!step.key) step.key = step.id;
      if (!step.options) step.options = [];
      if (!step.urgent_values) step.urgent_values = [];
      if (step.free_text === undefined) step.free_text = false;
    }

    return flow;
  } catch (parseErr) {
    console.error("AI flow parse error:", parseErr, "\nRaw:", raw);
    throw new Error("Failed to parse AI-generated flow. Please try again.");
  }
}

// ─── Smart Reply Parsing ───

export async function parseNaturalLanguageReply(step, replyText) {
  const optionsList = step.options
    .map((o) => `${o.value} = "${o.label}"`)
    .join(", ");

  const prompt = `A customer replied to this SMS question:

Question: "${step.question}"
Valid options: ${optionsList}

Customer reply: "${replyText}"

Which option value best matches their reply? If the reply clearly maps to one option, return ONLY the option value (e.g. "A" or "1"). If it doesn't match any option, return "INVALID".

Return ONLY the value, nothing else.`;

  const result = await callOpenAI(
    [{ role: "user", content: prompt }],
    { temperature: 0.1, max_tokens: 10 },
  );

  const cleaned = result.trim().replace(/"/g, "").toUpperCase();
  const match = step.options.find(
    (o) => o.value.toUpperCase() === cleaned,
  );
  return match ? match.value : null;
}

// ─── AI Available Check ───

export function isAIConfigured() {
  return Boolean(getApiKey());
}
