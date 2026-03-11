const BASE_URL = "https://hello.timelygpt.co.kr/api/v2/chat";
const API_KEY = process.env.TIMELY_API_KEY || "";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const res = await fetch(`${BASE_URL}/sdk-auth/authenticate`, {
    headers: { "X-Timely-API": API_KEY },
  });

  if (!res.ok) {
    throw new Error(`Authentication failed: ${res.status} ${await res.text()}`);
  }

  const data: any = await res.json();
  cachedToken = data.access_token || data.token;
  // Refresh 5 minutes before expiry, default 1 hour
  tokenExpiry = Date.now() + ((data.expires_in || 3600) - 300) * 1000;
  return cachedToken!;
}

async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "access-token": token,
      "Content-Type": "application/json",
    },
  });
}

export async function getModels(): Promise<any[]> {
  const res = await authedFetch(`${BASE_URL}/metadata/models`);
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  return res.json() as Promise<any[]>;
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  instructions?: string;
  session_id?: string;
  stream?: boolean;
}

export async function chat(request: ChatRequest): Promise<any> {
  const res = await authedFetch(`${BASE_URL}/llm-completion`, {
    method: "POST",
    body: JSON.stringify({
      model: request.model || "claude-haiku-4-5",
      messages: request.messages,
      instructions: request.instructions || "",
      session_id: request.session_id || "",
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function getWorkflows(): Promise<any> {
  const res = await authedFetch(`${BASE_URL}/ai-workflow/list`);
  if (!res.ok) {
    throw new Error(`Failed to fetch workflows: ${res.status}`);
  }
  return res.json();
}

export async function runWorkflow(workflowId: string, input: string): Promise<any> {
  // First load the latest published version, then execute via llm-completion with workflow context
  const res = await authedFetch(`${BASE_URL}/llm-completion`, {
    method: "POST",
    body: JSON.stringify({
      messages: [{ role: "user", content: input }],
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`Workflow execution failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
