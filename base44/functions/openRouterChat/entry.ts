import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
      return Response.json({ error: "messages must be a non-empty array with at most 50 items" }, { status: 400 });
    }

    const allowedRoles = new Set(["system", "user", "assistant"]);
    const validMessages = messages.every((message) =>
      message &&
      allowedRoles.has(message.role) &&
      typeof message.content === "string" &&
      message.content.length > 0 &&
      message.content.length <= 20000
    );
    if (!validMessages) {
      return Response.json({ error: "Each message requires a valid role and content of 1–20,000 characters" }, { status: 400 });
    }

    const apiKey = secrets.get("OPEN_ROUTER_API_KEY");
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol-pro",
        messages,
        max_tokens: 1024,
        provider: {
          zdr: true,
          data_collection: "deny",
        },
      }),
    });

    const data = await openRouterResponse.json();
    if (!openRouterResponse.ok) {
      console.error("OpenRouter request failed", openRouterResponse.status, data?.error?.message || "Unknown error");
      return Response.json(
        { error: data?.error?.message || "OpenRouter request failed" },
        { status: openRouterResponse.status },
      );
    }

    return Response.json({
      content: data?.choices?.[0]?.message?.content ?? "",
      model: data?.model || "openai/gpt-5.6-sol-pro",
      usage: data?.usage || null,
    });
  } catch (error) {
    console.error("OpenRouter chat function error", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Unable to complete the OpenRouter request" }, { status: 500 });
  }
}