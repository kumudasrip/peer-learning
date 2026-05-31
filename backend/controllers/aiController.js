import { HttpError } from "../utils/httpError.js";

export const askAI = async (req, res, next) => {
  try {
    const { question } = req.body;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an AI peer mentor for students. Answer questions about coding, AI, DSA, and roadmaps in a supportive, clear, and approachable way.",
            },
            {
              role: "user",
              content: question,
            },
          ],
        }),
      }
    );

    const data = await response.json();

    res.json({
      answer: data.choices[0].message.content,
    });
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(500, "AI request failed"));
  }
};

export const generateSessionSummary = async (req, res, next) => {
  try {
    const { messages } = req.body;

    // Limit to the last 100 messages to prevent excessive token usage
    const recentMessages = messages.slice(-100);

    let conversationText = recentMessages
      .map((msg) => `${msg.username || "User"}: ${msg.message}`)
      .join("\n");

    // Hard limit on character count (approx 5000 tokens max)
    if (conversationText.length > 20000) {
      conversationText = conversationText.slice(-20000);
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an AI learning assistant. Generate a concise learning session summary and key takeaways from the conversation. Respond ONLY in valid JSON format like: {\"summary\":\"...\",\"key_takeaways\":[\"...\",\"...\"]}",
            },
            {
              role: "user",
              content: conversationText,
            },
          ],
        }),
      }
    );

    const data = await response.json();

    const content =
      data?.choices?.[0]?.message?.content;

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        summary: content,
        key_takeaways: [],
      };
    }

    res.json(parsed);
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(500, "Summary generation failed"));
  }
};
