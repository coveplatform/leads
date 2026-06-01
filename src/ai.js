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
  const prompt = `You are a lead qualification expert. Generate a SHORT SMS auto-reply for a ${industry} business${businessName ? ` called "${businessName}"` : ""}. This is sent automatically when the business MISSES a phone call.

${extraContext ? `Additional context: ${extraContext}` : ""}

The reply is an instant text-back plus exactly ONE question. The single question must tell the owner whether to call back NOW or later (urgency / type of need) while being effortless to answer in one tap. Do not ask for timing, contact details, or anything else — keep it to one question so people actually reply.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "intro": "Hi {firstName}, sorry we missed your call — this is {businessName}. One quick question:",
  "completion": "Thanks! {businessName} will call you back shortly.",
  "completion_with_booking": "Thanks! {businessName} will call you back shortly. Or book here: {bookingLink}",
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
- steps MUST contain exactly ONE question
- Use A/B/C letters OR 1/2/3/4/5 numbers for options (not both in same question)
- Keep the question SHORT — it's an SMS
- urgent_values array: which option values indicate urgency (triggers instant owner alert)
- The intro MUST contain {firstName} and {businessName} placeholders and acknowledge the missed call
- The completion MUST contain {businessName} placeholder
- completion_with_booking MUST contain {businessName} and {bookingLink}
- Make the question industry-specific and natural
- free_text should be false`;

  const raw = await callOpenAI([{ role: "user", content: prompt }], {
    temperature: 0.6,
  });

  try {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const flow = JSON.parse(cleaned);

    if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
      throw new Error("Invalid flow: no steps");
    }

    // Enforce the one-question rule even if the model returns extras.
    flow.steps = flow.steps.slice(0, 1);

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

// ─── Condense Free Text Answers for Owner Summary ───
// Called once per completed lead — only processes free_text steps with long answers.

export async function condenseFreeTextAnswers(flowConfig, answers) {
  const freeTextSteps = (flowConfig.steps || []).filter((s) => s.free_text);
  if (!freeTextSteps.length) return answers;

  const updated = { ...answers };

  for (const step of freeTextSteps) {
    const raw = answers[`${step.key}_label`];
    if (!raw || raw.length <= 60) continue; // Short enough already

    try {
      const prompt = `Summarise this customer SMS reply in one short phrase (max 10 words). Preserve the key detail. Drop filler words.

Question: "${step.question}"
Reply: "${raw}"

Return ONLY the summary, nothing else.`;

      const result = await callOpenAI(
        [{ role: "user", content: prompt }],
        { temperature: 0.2, max_tokens: 30 },
      );

      const condensed = result.trim();
      if (condensed) {
        updated[`${step.key}_label`] = condensed;
        updated[`${step.key}_label_full`] = raw; // preserve original
      }
    } catch {
      // Keep original on any error
    }
  }

  return updated;
}

// ─── AI Available Check ───

export function isAIConfigured() {
  return Boolean(getApiKey());
}
