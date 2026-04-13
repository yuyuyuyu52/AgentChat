type ErrorPayload = {
  message?: string;
};

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return response.json();
}

async function requestAuth(path: string, body: Record<string, string>): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? (payload as ErrorPayload).message
        : undefined;
    throw new Error(message ?? `Request failed with status ${response.status}`);
  }
}

export function loginHumanUser(input: { email: string; password: string }): Promise<void> {
  return requestAuth("/auth/login", input);
}

export function registerHumanUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  return requestAuth("/auth/register", input);
}
