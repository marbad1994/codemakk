import type {
  RouterChatChunk,
  RouterChatRequest,
  RouterChatResponse
} from "./types.js";

export class RouterClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string = "dummy"
  ) {}

  async chat(request: RouterChatRequest): Promise<RouterChatResponse> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: this.headers(request),
      body: JSON.stringify({
        model: request.model,
        stream: false,
        messages: request.messages
      })
    });

    if (!response.ok) {
      throw new Error(`Router request failed: ${response.status} ${await response.text()}`);
    }

    const json = await response.json();

    return {
      content: json.choices?.[0]?.message?.content ?? "",
      raw: json
    };
  }

  async *chatStream(request: RouterChatRequest): AsyncIterable<RouterChatChunk> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: request.signal,
      headers: this.headers(request),
      body: JSON.stringify({
        model: request.model,
        stream: true,
        messages: request.messages
      })
    });

    if (!response.ok) {
      throw new Error(`Router stream failed: ${response.status} ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error("Router stream failed: empty body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part
          .split(/\r?\n/)
          .find((entry) => entry.startsWith("data:"));

        if (!line) {
          continue;
        }

        const data = line.slice("data:".length).trim();

        if (data === "[DONE]") {
          return;
        }

        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content ?? "";

if (content) {
  yield {
    content,
    model: json.model,
    usedModel: json.router?.usedModel ?? json.model,
    requestedModel: json.router?.requestedModel,
    raw: json
  };
}
      }
    }
  }

  private headers(request: RouterChatRequest): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.apiKey}`,
      "x-router-profile": request.profile ?? "balanced",
      "x-router-speed": String(request.speed ?? 5),
      "x-router-local-preference": String(request.localPreference ?? false)
    };
  }
}
