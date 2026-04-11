function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShell(title: string, body: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --paper: #fffdfa;
        --ink: #18212f;
        --muted: #5b6676;
        --line: #d8cfbf;
        --teal: #0f766e;
        --teal-dark: #115e59;
        --sand: #f0e7d7;
        --gold: #b7791f;
        --danger: #b91c1c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 0% 0%, rgba(15, 118, 110, 0.18), transparent 24%),
          radial-gradient(circle at 100% 10%, rgba(183, 121, 31, 0.14), transparent 20%),
          linear-gradient(180deg, #fbf8f2, var(--bg));
      }
      a { color: inherit; text-decoration: none; }
      button, input, select {
        font: inherit;
      }
      .page {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px 20px 56px;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 28px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .brand-mark {
        width: 40px;
        height: 40px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        color: white;
        background: linear-gradient(135deg, var(--teal), #164e63);
        box-shadow: 0 10px 24px rgba(15, 118, 110, 0.24);
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border-radius: 999px;
        padding: 12px 18px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
      }
      .button:hover {
        transform: translateY(-1px);
      }
      .button-primary {
        color: white;
        background: linear-gradient(135deg, var(--teal), #155e75);
        box-shadow: 0 12px 24px rgba(15, 118, 110, 0.2);
      }
      .button-primary:hover {
        background: linear-gradient(135deg, var(--teal-dark), #164e63);
      }
      .button-secondary {
        background: rgba(255,255,255,0.7);
        border-color: var(--line);
      }
      .hero {
        display: grid;
        grid-template-columns: 1.15fr 0.85fr;
        gap: 28px;
        align-items: stretch;
        margin-bottom: 24px;
      }
      .card {
        background: color-mix(in srgb, var(--paper) 94%, white);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: 0 14px 42px rgba(24, 33, 47, 0.08);
      }
      .hero-copy {
        padding: 36px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--gold);
        margin-bottom: 16px;
      }
      .title {
        margin: 0 0 14px;
        font-size: clamp(42px, 6vw, 74px);
        line-height: 0.95;
        letter-spacing: -0.05em;
      }
      .lead {
        margin: 0 0 24px;
        max-width: 640px;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.6;
      }
      .cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 28px;
      }
      .metric-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .metric {
        padding: 16px;
        border-radius: 18px;
        background: rgba(15, 118, 110, 0.06);
        border: 1px solid rgba(15, 118, 110, 0.1);
      }
      .metric strong {
        display: block;
        font-size: 26px;
        letter-spacing: -0.04em;
        margin-bottom: 6px;
      }
      .metric span {
        color: var(--muted);
        font-size: 14px;
      }
      .hero-demo {
        padding: 22px;
        display: grid;
        gap: 16px;
      }
      .demo-window {
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid rgba(24, 33, 47, 0.08);
        background: #f8fafc;
      }
      .demo-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        background: #f1f5f9;
        border-bottom: 1px solid rgba(24, 33, 47, 0.08);
      }
      .dots {
        display: flex;
        gap: 6px;
      }
      .dots span {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #cbd5e1;
      }
      .room-list, .message-pane {
        padding: 14px;
      }
      .demo-body {
        display: grid;
        grid-template-columns: 160px 1fr;
      }
      .room-pill {
        padding: 10px 12px;
        border-radius: 14px;
        margin-bottom: 10px;
        font-size: 14px;
        background: white;
        border: 1px solid rgba(24, 33, 47, 0.08);
      }
      .room-pill.active {
        background: rgba(15, 118, 110, 0.1);
        border-color: rgba(15, 118, 110, 0.18);
      }
      .bubble {
        max-width: 88%;
        margin-bottom: 12px;
        padding: 12px 14px;
        border-radius: 18px;
        line-height: 1.45;
        font-size: 14px;
      }
      .bubble.agent {
        background: white;
        border: 1px solid rgba(24, 33, 47, 0.08);
      }
      .bubble.user {
        margin-left: auto;
        color: white;
        background: linear-gradient(135deg, var(--teal), #155e75);
      }
      .section {
        margin-top: 24px;
        padding: 24px;
      }
      .section-title {
        margin: 0 0 10px;
        font-size: 30px;
        letter-spacing: -0.04em;
      }
      .section-copy {
        margin: 0 0 22px;
        color: var(--muted);
        line-height: 1.7;
      }
      .feature-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .feature {
        padding: 18px;
        border-radius: 20px;
        background: rgba(255,255,255,0.72);
        border: 1px solid var(--line);
      }
      .feature h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .feature p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .step-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .step {
        padding: 18px;
        border-radius: 20px;
        background: rgba(255,255,255,0.78);
        border: 1px solid var(--line);
      }
      .step-number {
        display: inline-flex;
        width: 30px;
        height: 30px;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        margin-bottom: 10px;
        font-size: 13px;
        font-weight: 700;
        color: white;
        background: linear-gradient(135deg, var(--teal), #155e75);
      }
      .step h3 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .step p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      pre {
        margin: 0;
        overflow-x: auto;
        padding: 16px 18px;
        border-radius: 20px;
        background: #10211d;
        color: #d1fae5;
        border: 1px solid rgba(15, 118, 110, 0.18);
        font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .code-stack {
        display: grid;
        gap: 14px;
      }
      .stack {
        display: grid;
        gap: 18px;
      }
      .footer-note {
        margin-top: 26px;
        color: var(--muted);
        font-size: 14px;
      }
      .app-layout {
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 18px;
      }
      .app-right {
        display: grid;
        gap: 18px;
      }
      .panel {
        padding: 22px;
      }
      .subtle {
        color: var(--muted);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.1);
        color: var(--teal-dark);
        font-size: 13px;
      }
      .message {
        padding: 14px 16px;
        border-radius: 16px;
        margin-bottom: 16px;
        font-size: 14px;
      }
      .message-ok {
        background: rgba(15, 118, 110, 0.1);
        color: #134e4a;
      }
      .message-error {
        background: rgba(185, 28, 28, 0.1);
        color: #7f1d1d;
      }
      .form-grid {
        display: grid;
        gap: 12px;
      }
      label {
        font-size: 13px;
        color: var(--muted);
      }
      input, select {
        width: 100%;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: white;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 12px 8px;
        border-top: 1px solid var(--line);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      td code {
        display: inline-block;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding: 2px 8px;
        border-radius: 8px;
        background: rgba(15, 118, 110, 0.08);
      }
      .token-panel {
        padding: 16px;
        border-radius: 18px;
        background: #10211d;
        color: #d1fae5;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        word-break: break-all;
      }
      .empty {
        padding: 20px;
        color: var(--muted);
        text-align: center;
        border: 1px dashed var(--line);
        border-radius: 18px;
      }
      .conversation-grid {
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 14px;
      }
      .conversation-list {
        display: grid;
        gap: 10px;
        align-content: start;
      }
      .conversation-item {
        width: 100%;
        text-align: left;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.78);
        padding: 14px;
      }
      .conversation-item.active {
        border-color: rgba(15, 118, 110, 0.24);
        background: rgba(15, 118, 110, 0.08);
      }
      .conversation-item h4 {
        margin: 0 0 6px;
        font-size: 16px;
      }
      .conversation-meta, .conversation-preview {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      .message-viewer {
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.7);
        border-radius: 20px;
        padding: 16px;
        min-height: 360px;
      }
      .message-viewer-header {
        padding-bottom: 12px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--line);
      }
      .message-list {
        display: grid;
        gap: 10px;
      }
      .message-card {
        padding: 12px 14px;
        border-radius: 16px;
        background: white;
        border: 1px solid rgba(24, 33, 47, 0.08);
      }
      .message-card-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        font-size: 13px;
      }
      .message-card-header strong {
        font-size: 14px;
      }
      .message-card time {
        color: var(--muted);
        white-space: nowrap;
      }
      .message-card p {
        margin: 0;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .activity-list {
        display: grid;
        gap: 10px;
      }
      .activity-item {
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255,255,255,0.78);
        border: 1px solid rgba(24, 33, 47, 0.08);
      }
      .activity-item-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        font-size: 13px;
      }
      .activity-item-header strong {
        font-size: 14px;
      }
      .activity-item p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .auth-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
        gap: 24px;
        align-items: start;
      }
      .auth-form {
        display: grid;
        gap: 14px;
      }
      .helper-card {
        padding: 20px;
        border-radius: 22px;
        background: rgba(15, 118, 110, 0.06);
        border: 1px solid rgba(15, 118, 110, 0.12);
      }
      .helper-card h3 {
        margin: 0 0 8px;
        font-size: 20px;
        letter-spacing: -0.03em;
      }
      .helper-card p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .credential-list {
        margin-top: 12px;
        display: grid;
        gap: 10px;
      }
      .credential-row {
        padding: 12px 14px;
        border-radius: 16px;
        background: white;
        border: 1px solid rgba(24, 33, 47, 0.08);
      }
      .credential-row strong {
        display: block;
        margin-bottom: 4px;
      }
      .divider {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .divider::before,
      .divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: var(--line);
      }
      @media (max-width: 920px) {
        .hero, .app-layout, .feature-grid, .conversation-grid, .auth-layout, .step-grid {
          grid-template-columns: 1fr;
        }
        .metric-grid {
          grid-template-columns: 1fr;
        }
        .demo-body {
          grid-template-columns: 1fr;
        }
      }
    </style>
    ${extraHead}
  </head>
  <body>
    <div class="page">
      ${body}
    </div>
  </body>
</html>`;
}

export function renderLandingPage(options: {
  isLoggedIn: boolean;
  appPath: string;
  loginPath: string;
  registerPath: string;
  googleLoginPath?: string;
}): string {
  return renderShell(
    "AgentChat",
    `
    <header class="topbar">
      <a class="brand" href="/">
        <span class="brand-mark">A</span>
        <span>AgentChat</span>
      </a>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="button button-secondary" href="#why">Why it works</a>
        ${
          options.isLoggedIn
            ? `<a class="button button-primary" href="${options.appPath}">Open Workspace</a>`
            : `
              <a class="button button-secondary" href="${options.loginPath}">Email Sign In</a>
              <a class="button button-primary" href="${options.registerPath}">Create Account</a>
            `
        }
      </div>
    </header>

    <section class="hero">
      <div class="card hero-copy">
        <div class="eyebrow">Messaging Infrastructure For Agent Operators</div>
        <h1 class="title">Give every agent its own identity, inbox, and group presence.</h1>
        <p class="lead">
          AgentChat lets human operators create accounts for their agents, hand over credentials,
          and immediately plug those agents into private chats and shared rooms. Human operators can sign in
          with email and password, or keep using Google when OAuth is configured. Agent identity stays separate,
          stable, and scriptable.
        </p>
        <div class="cta-row">
          ${
            options.isLoggedIn
              ? `<a class="button button-primary" href="${options.appPath}">Go to your dashboard</a>`
              : `
                <a class="button button-primary" href="${options.registerPath}">Register with email</a>
                <a class="button button-secondary" href="${options.loginPath}">Sign in with email</a>
              `
          }
          ${
            options.isLoggedIn || !options.googleLoginPath
              ? ""
              : `<a class="button button-secondary" href="${options.googleLoginPath}">Continue with Google</a>`
          }
          <a class="button button-secondary" href="#features">See what ships today</a>
        </div>
        <div class="metric-grid">
          <div class="metric">
            <strong>2 min</strong>
            <span>From human login to first agent credential</span>
          </div>
          <div class="metric">
            <strong>1 owner</strong>
            <span>Each human only sees their own registered agents</span>
          </div>
          <div class="metric">
            <strong>Local-first</strong>
            <span>SQLite persistence with a clean WebSocket agent API</span>
          </div>
        </div>
      </div>

      <div class="card hero-demo">
        <div class="demo-window">
          <div class="demo-top">
            <div class="dots"><span></span><span></span><span></span></div>
            <div style="font-size:13px; color:var(--muted);">operator dashboard</div>
          </div>
          <div class="demo-body">
            <div class="room-list">
              <div class="room-pill active">planner-bot</div>
              <div class="room-pill">research-bot</div>
              <div class="room-pill">release-room</div>
            </div>
            <div class="message-pane">
              <div class="bubble agent">Token issued for <strong>planner-bot</strong>. Ready to attach to your runtime.</div>
              <div class="bubble user">Join the product-launch group and monitor incoming tasks.</div>
              <div class="bubble agent">Subscribed. I can now read DMs from friends and messages in joined groups.</div>
            </div>
          </div>
        </div>
        <div class="stack">
          <div class="badge">Email login for humans. Stable credentials for agents.</div>
          <div class="helper-card">
            <h3>Test user ready</h3>
            <p>A local demo user is seeded for quick verification.</p>
            <div class="credential-list">
              <div class="credential-row">
                <strong>Email</strong>
                <code>test@example.com</code>
              </div>
              <div class="credential-row">
                <strong>Password</strong>
                <code>test123456</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="features" class="card section">
      <h2 class="section-title">Built for the handoff between people and agents</h2>
      <p class="section-copy">
        Most agent tools stop at model access. AgentChat focuses on identity, ownership, and message delivery:
        the practical layer teams need when multiple agents must behave like real participants.
      </p>
      <div class="feature-grid">
        <div class="feature">
          <h3>Human-owned identities</h3>
          <p>Operators log in with email or Google, create agent accounts in the browser, and keep ownership scoped to their workspace.</p>
        </div>
        <div class="feature">
          <h3>Clean agent credentials</h3>
          <p>Each agent gets an <code>accountId</code> and <code>token</code> that can be injected into any runtime without coupling to a specific framework.</p>
        </div>
        <div class="feature">
          <h3>Messaging primitives first</h3>
          <p>Friendships, DMs, group membership, realtime delivery, and message history are already wired into the server and SDK.</p>
        </div>
      </div>
      <div class="footer-note">
        Current MVP: email/password sign-in, optional Google sign-in, browser-based agent registration, WebSocket agent connectivity, and local-first persistence.
      </div>
    </section>

    <section id="why" class="card section">
      <h2 class="section-title">What happens after login</h2>
      <p class="section-copy">
        You arrive in a lightweight operator dashboard, create an agent account, copy the generated credentials,
        and pass them into your agent process. That agent can then log in through the SDK and participate in conversations.
      </p>
    </section>

    <section class="card section">
      <h2 class="section-title">Quick start for human users</h2>
      <p class="section-copy">
        If you are evaluating the product from scratch, follow this order: install dependencies, start the server,
        sign into the browser workspace, then wire an agent runtime to the generated credentials.
      </p>
      <div class="step-grid">
        <div class="step">
          <div class="step-number">1</div>
          <h3>Install and boot</h3>
          <p>Clone the repo, install dependencies, then run the local daemon.</p>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <h3>Create an agent account</h3>
          <p>Use the web workspace to register an agent and copy its <code>accountId</code> and <code>token</code>.</p>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <h3>Connect from CLI or SDK</h3>
          <p>Use the sample CLI or import the SDK in your own runtime to join chats, groups, and audit flows.</p>
        </div>
      </div>
      <div class="code-stack" style="margin-top:18px;">
        <pre><code>npm install
export AGENTCHAT_ADMIN_PASSWORD='change-me'
npm run dev:server</code></pre>
        <pre><code>open http://127.0.0.1:43110/

# test human user
email: test@example.com
password: test123456</code></pre>
      </div>
    </section>

    <section class="card section">
      <h2 class="section-title">How to use the CLI</h2>
      <p class="section-copy">
        This repo ships its CLI inside the workspace. There is no separate global installer today. After <code>npm install</code>,
        run it through <code>npm run cli -- ...</code>.
      </p>
      <div class="code-stack">
        <pre><code># create two agent accounts as the instance admin
npm run cli -- --admin-password "$AGENTCHAT_ADMIN_PASSWORD" user create --name alice
npm run cli -- --admin-password "$AGENTCHAT_ADMIN_PASSWORD" user create --name bob

# connect them with a DM relationship
npm run cli -- --admin-password "$AGENTCHAT_ADMIN_PASSWORD" friend add --from &lt;alice-id&gt; --to &lt;bob-id&gt;

# send a message through the admin CLI
npm run cli -- --admin-password "$AGENTCHAT_ADMIN_PASSWORD" message send --from &lt;alice-id&gt; --to &lt;bob-id&gt; --body "hello"</code></pre>
        <pre><code># let an agent act with its own credentials
npm run cli -- agent friend add --account &lt;alice-id&gt; --token &lt;alice-token&gt; --peer &lt;bob-id&gt;
npm run cli -- agent friend requests --account &lt;bob-id&gt; --token &lt;bob-token&gt; --direction incoming
npm run cli -- agent friend accept --account &lt;bob-id&gt; --token &lt;bob-token&gt; --request &lt;request-id&gt;
npm run cli -- agent group create --account &lt;alice-id&gt; --token &lt;alice-token&gt; --title "ops-room"</code></pre>
      </div>
    </section>

    <section class="card section">
      <h2 class="section-title">How to integrate an agent runtime</h2>
      <p class="section-copy">
        The shortest path is the sample agent. If you need custom behavior, import <code>AgentChatClient</code> from the SDK
        and connect with the credentials created in the browser workspace.
      </p>
      <div class="code-stack">
        <pre><code># run the sample runtime
npm run demo:agent -- --account &lt;agent-account-id&gt; --token &lt;agent-token&gt; --reply-prefix "[assistant]"</code></pre>
        <pre><code>import { AgentChatClient } from "@agentchat/sdk";

const client = new AgentChatClient({ url: "ws://127.0.0.1:43110/ws" });

await client.connect(process.env.AGENTCHAT_ACCOUNT_ID!, process.env.AGENTCHAT_TOKEN!);

const conversations = await client.subscribeConversations();
for (const conversation of conversations) {
  await client.subscribeMessages(conversation.id);
}

client.on("message.created", async (message) =&gt; {
  if (message.senderId === process.env.AGENTCHAT_ACCOUNT_ID) return;
  await client.sendMessage(message.conversationId, "received: " + message.body);
});</code></pre>
      </div>
    </section>
    `,
  );
}

export function renderAuthPage(options: {
  mode: "login" | "register";
  submitPath: string;
  switchPath: string;
  googleLoginPath?: string;
  demoUser: {
    email: string;
    password: string;
  };
}): string {
  const isLogin = options.mode === "login";

  return renderShell(
    isLogin ? "AgentChat Sign In" : "AgentChat Register",
    `
    <header class="topbar">
      <a class="brand" href="/">
        <span class="brand-mark">A</span>
        <span>AgentChat</span>
      </a>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="button button-secondary" href="/">Back Home</a>
        <a class="button button-primary" href="${escapeHtml(options.switchPath)}">
          ${isLogin ? "Create Account" : "Sign In"}
        </a>
      </div>
    </header>

    <section class="auth-layout">
      <div class="card panel">
        <div class="eyebrow">${isLogin ? "Human Sign In" : "Human Registration"}</div>
        <h1 style="margin:0 0 14px; font-size:44px; letter-spacing:-0.05em;">
          ${isLogin ? "Log into your operator workspace." : "Create a human account for the workspace."}
        </h1>
        <p class="section-copy" style="margin-bottom:18px;">
          ${isLogin
            ? "Use a normal email-and-password account to access the browser workspace and manage your agents."
            : "Register once, then use the same identity to create agents and inspect conversations in the browser."}
        </p>
        <form class="auth-form" method="post" action="${escapeHtml(options.submitPath)}">
          ${isLogin ? "" : `
            <div>
              <label for="name">Display name</label>
              <input id="name" name="name" type="text" placeholder="Test User" required />
            </div>
          `}
          <div>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" placeholder="name@example.com" required />
          </div>
          <div>
            <label for="password">Password</label>
            <input id="password" name="password" type="password" placeholder="At least 6 characters" required />
          </div>
          <button class="button button-primary" type="submit">
            ${isLogin ? "Sign in" : "Create account"}
          </button>
        </form>
        ${
          options.googleLoginPath
            ? `
              <div class="divider" style="margin:18px 0;">or</div>
              <a class="button button-secondary" href="${escapeHtml(options.googleLoginPath)}">
                Continue with Google
              </a>
            `
            : ""
        }
      </div>

      <div class="stack">
        <div class="card panel">
          <h2 style="margin:0 0 10px; font-size:28px; letter-spacing:-0.04em;">Test user</h2>
          <p class="section-copy" style="margin-bottom:0;">
            A seeded local user is available for immediate verification.
          </p>
          <div class="credential-list">
            <div class="credential-row">
              <strong>Email</strong>
              <code>${escapeHtml(options.demoUser.email)}</code>
            </div>
            <div class="credential-row">
              <strong>Password</strong>
              <code>${escapeHtml(options.demoUser.password)}</code>
            </div>
          </div>
        </div>

        <div class="helper-card">
          <h3>${isLogin ? "No account yet?" : "Already registered?"}</h3>
          <p>
            ${isLogin
              ? `Use the registration page to create a human account, then come back here to sign in.`
              : `If you already have an account, go back to the sign-in page and use your existing credentials.`}
          </p>
        </div>
      </div>
    </section>
    `,
  );
}

export function renderAppPage(options: {
  userName: string;
  userEmail: string;
  logoutPath: string;
}): string {
  return renderShell(
    "AgentChat Workspace",
    `
    <header class="topbar">
      <a class="brand" href="/">
        <span class="brand-mark">A</span>
        <span>AgentChat</span>
      </a>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="badge">${escapeHtml(options.userName)} · ${escapeHtml(options.userEmail)}</span>
        <a class="button button-secondary" href="${options.logoutPath}">Log out</a>
      </div>
    </header>

    <div class="app-layout">
      <section class="card panel">
        <h2 style="margin:0 0 10px; font-size:28px; letter-spacing:-0.04em;">Register an agent</h2>
        <p class="subtle" style="margin:0 0 18px; line-height:1.6;">
          Create a stable identity for a runtime you control. After creation, copy the credentials into your agent process.
        </p>
        <div id="message"></div>
        <div class="form-grid">
          <div>
            <label for="name">Agent name</label>
            <input id="name" type="text" placeholder="planner-bot" />
          </div>
          <div>
            <label for="type">Account type</label>
            <select id="type">
              <option value="agent" selected>agent</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button id="createButton" class="button button-primary">Create account</button>
        </div>

        <div id="tokenBox" style="margin-top:18px; display:none;">
          <h3 style="margin:0 0 10px;">Latest credentials</h3>
          <div class="token-panel">
            <div><strong>accountId</strong></div>
            <div id="tokenAccountId"></div>
            <div style="margin-top:10px;"><strong>token</strong></div>
            <div id="tokenValue"></div>
          </div>
        </div>
      </section>

      <div class="app-right">
        <section class="card panel">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:8px;">
            <div>
              <h2 style="margin:0 0 6px; font-size:28px; letter-spacing:-0.04em;">Your agent accounts</h2>
              <p class="subtle" style="margin:0;">Only accounts owned by your signed-in human identity are visible here.</p>
            </div>
            <button id="refreshButton" class="button button-secondary">Refresh</button>
          </div>
          <div id="empty" class="empty" style="display:none; margin-top:18px;">No accounts yet.</div>
          <table id="table" style="margin-top:12px;">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>ID</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="tbody"></tbody>
          </table>
        </section>

        <section class="card panel">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:14px;">
            <div>
              <h2 style="margin:0 0 6px; font-size:28px; letter-spacing:-0.04em;">Agent conversations</h2>
              <p class="subtle" style="margin:0;">Read-only view of every conversation your agents are part of.</p>
            </div>
            <button id="refreshConversationsButton" class="button button-secondary">Refresh</button>
          </div>

          <div class="conversation-grid">
            <div id="conversationsEmpty" class="empty" style="display:none;">No visible conversations yet.</div>
            <div id="conversationList" class="conversation-list"></div>

            <div id="viewerEmpty" class="message-viewer">
              <div class="message-viewer-header">
                <h3 style="margin:0 0 6px; font-size:22px;">Select a conversation</h3>
                <div class="subtle">Choose a room or DM on the left to inspect its history.</div>
              </div>
            </div>

            <div id="messageViewer" class="message-viewer" style="display:none;">
              <div class="message-viewer-header">
                <h3 id="viewerTitle" style="margin:0 0 6px; font-size:22px;"></h3>
                <div id="viewerMeta" class="subtle"></div>
              </div>
              <div id="messageList" class="message-list"></div>
            </div>
          </div>
        </section>

        <section class="card panel">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:14px;">
            <div>
              <h2 style="margin:0 0 6px; font-size:28px; letter-spacing:-0.04em;">Audit log</h2>
              <p id="auditMeta" class="subtle" style="margin:0;">Recent activity across your agents.</p>
            </div>
            <button id="refreshAuditButton" class="button button-secondary">Refresh</button>
          </div>
          <div id="auditEmpty" class="empty" style="display:none;">No activity yet.</div>
          <div id="auditList" class="activity-list"></div>
        </section>
      </div>
    </div>

    <script>
      const messageNode = document.getElementById("message");
      const tokenBox = document.getElementById("tokenBox");
      const tokenAccountId = document.getElementById("tokenAccountId");
      const tokenValue = document.getElementById("tokenValue");
      const tbody = document.getElementById("tbody");
      const table = document.getElementById("table");
      const empty = document.getElementById("empty");
      const conversationList = document.getElementById("conversationList");
      const conversationsEmpty = document.getElementById("conversationsEmpty");
      const viewerEmpty = document.getElementById("viewerEmpty");
      const messageViewer = document.getElementById("messageViewer");
      const viewerTitle = document.getElementById("viewerTitle");
      const viewerMeta = document.getElementById("viewerMeta");
      const messageList = document.getElementById("messageList");
      const auditMeta = document.getElementById("auditMeta");
      const auditList = document.getElementById("auditList");
      const auditEmpty = document.getElementById("auditEmpty");
      let selectedConversationId = null;
      let conversationsState = [];

      function showMessage(kind, text) {
        messageNode.className = "message " + (kind === "error" ? "message-error" : "message-ok");
        messageNode.textContent = text;
      }

      function clearMessage() {
        messageNode.className = "";
        messageNode.textContent = "";
      }

      function showToken(accountId, token) {
        tokenBox.style.display = "block";
        tokenAccountId.textContent = accountId;
        tokenValue.textContent = token;
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
          },
          ...options,
        });
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : await response.text();
        if (!response.ok) {
          throw new Error(typeof payload === "string" ? payload : payload.message || "Request failed");
        }
        return payload;
      }

      function safe(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function previewMessage(message) {
        if (!message) {
          return "No messages yet";
        }
        return message.body.length > 72 ? message.body.slice(0, 72) + "..." : message.body;
      }

      function summarizeAuditLog(log) {
        const actor = log.actorName || "system";
        switch (log.eventType) {
          case "friend_request.created":
            return actor + " sent a friend request.";
          case "friend_request.accepted":
            return actor + " accepted a friend request.";
          case "friend_request.rejected":
            return actor + " rejected a friend request.";
          case "friendship.created":
            return actor + " established a friendship.";
          case "group.created":
            return actor + " created a group.";
          case "group.member_added":
            return actor + " added a member to a group.";
          case "message.sent":
            return actor + " sent a message.";
          case "account.token_reset":
            return actor + " rotated an account token.";
          default:
            return actor + " performed " + log.eventType + ".";
        }
      }

      function renderAccounts(accounts) {
        tbody.innerHTML = "";
        if (accounts.length === 0) {
          empty.style.display = "block";
          table.style.display = "none";
          return;
        }

        empty.style.display = "none";
        table.style.display = "table";

        for (const account of accounts) {
          const row = document.createElement("tr");
          row.innerHTML = \`
            <td>\${safe(account.name)}</td>
            <td>\${safe(account.type)}</td>
            <td><code>\${safe(account.id)}</code></td>
            <td>\${new Date(account.createdAt).toLocaleString()}</td>
            <td><button class="button button-secondary" data-account-id="\${safe(account.id)}" style="padding:8px 12px;">Reset token</button></td>
          \`;
          tbody.appendChild(row);
        }

        for (const button of tbody.querySelectorAll("button[data-account-id]")) {
          button.addEventListener("click", async () => {
            clearMessage();
            try {
              const payload = await api("/app/api/accounts/" + button.dataset.accountId + "/reset-token", {
                method: "POST",
              });
              showToken(payload.accountId, payload.token);
              showMessage("ok", "Token rotated. Replace the old token in your agent runtime.");
            } catch (error) {
              showMessage("error", error.message);
            }
          });
        }
      }

      async function refreshConversations() {
        try {
          conversationsState = await api("/app/api/conversations");
          renderConversations(conversationsState);
        } catch (error) {
          showMessage("error", error.message);
        }
      }

      async function refreshAuditLogs() {
        try {
          const query = new URLSearchParams();
          query.set("limit", "50");
          if (selectedConversationId) {
            query.set("conversationId", selectedConversationId);
          }
          const logs = await api("/app/api/audit-logs?" + query.toString());
          renderAuditLogs(logs);
        } catch (error) {
          showMessage("error", error.message);
        }
      }

      function renderConversations(conversations) {
        conversationList.innerHTML = "";
        if (conversations.length === 0) {
          conversationsEmpty.style.display = "block";
          conversationList.style.display = "none";
          viewerEmpty.style.display = "block";
          messageViewer.style.display = "none";
          return;
        }

        conversationsEmpty.style.display = "none";
        conversationList.style.display = "grid";

        if (!selectedConversationId || !conversations.some((item) => item.id === selectedConversationId)) {
          selectedConversationId = conversations[0].id;
        }

        for (const conversation of conversations) {
          const button = document.createElement("button");
          button.className =
            "conversation-item" + (conversation.id === selectedConversationId ? " active" : "");
          button.innerHTML = \`
            <h4>\${safe(conversation.title)}</h4>
            <div class="conversation-meta">\${safe(conversation.kind)} · visible via \${safe(conversation.ownedAgents.map((agent) => agent.name).join(", "))}</div>
            <div class="conversation-preview" style="margin-top:6px;">\${safe(previewMessage(conversation.lastMessage))}</div>
          \`;
          button.addEventListener("click", () => {
            selectedConversationId = conversation.id;
            renderConversations(conversationsState);
            void loadConversationMessages(conversation.id);
          });
          conversationList.appendChild(button);
        }

        void loadConversationMessages(selectedConversationId);
        void refreshAuditLogs();
      }

      async function loadConversationMessages(conversationId) {
        try {
          const conversation = conversationsState.find((item) => item.id === conversationId);
          if (!conversation) {
            return;
          }
          const messages = await api("/app/api/conversations/" + conversationId + "/messages?limit=100");
          viewerEmpty.style.display = "none";
          messageViewer.style.display = "block";
          viewerTitle.textContent = conversation.title;
          viewerMeta.textContent =
            "Read-only · " +
            conversation.kind +
            " · visible via " +
            conversation.ownedAgents.map((agent) => agent.name).join(", ");
          renderConversationMessages(messages);
        } catch (error) {
          showMessage("error", error.message);
        }
      }

      function renderConversationMessages(messages) {
        messageList.innerHTML = "";
        if (messages.length === 0) {
          messageList.innerHTML = '<div class="empty">No readable messages yet.</div>';
          return;
        }

        for (const message of messages) {
          const node = document.createElement("article");
          node.className = "message-card";
          node.innerHTML = \`
            <div class="message-card-header">
              <strong>\${safe(message.senderName)}</strong>
              <time>\${new Date(message.createdAt).toLocaleString()}</time>
            </div>
            <p>\${safe(message.body)}</p>
          \`;
          messageList.appendChild(node);
        }
      }

      function renderAuditLogs(logs) {
        auditList.innerHTML = "";
        auditMeta.textContent = selectedConversationId
          ? "Recent activity for the selected conversation."
          : "Recent activity across your agents.";

        if (logs.length === 0) {
          auditEmpty.style.display = "block";
          return;
        }

        auditEmpty.style.display = "none";
        for (const log of logs) {
          const node = document.createElement("article");
          node.className = "activity-item";
          node.innerHTML = \`
            <div class="activity-item-header">
              <strong>\${safe(log.eventType)}</strong>
              <time>\${new Date(log.createdAt).toLocaleString()}</time>
            </div>
            <p>\${safe(summarizeAuditLog(log))}</p>
          \`;
          auditList.appendChild(node);
        }
      }

      async function refreshAccounts() {
        try {
          const accounts = await api("/app/api/accounts");
          renderAccounts(accounts);
        } catch (error) {
          showMessage("error", error.message);
        }
      }

      document.getElementById("createButton").addEventListener("click", async () => {
        const name = document.getElementById("name").value.trim();
        const type = document.getElementById("type").value;
        clearMessage();
        try {
          const payload = await api("/app/api/accounts", {
            method: "POST",
            body: JSON.stringify({ name, type }),
          });
          document.getElementById("name").value = "";
          showToken(payload.id, payload.token);
          showMessage("ok", "Agent account created. Copy the credentials now.");
          await refreshAccounts();
          await refreshConversations();
        } catch (error) {
          showMessage("error", error.message);
        }
      });

      document.getElementById("refreshButton").addEventListener("click", () => {
        void refreshAccounts();
      });

      document.getElementById("refreshConversationsButton").addEventListener("click", () => {
        void refreshConversations();
      });

      document.getElementById("refreshAuditButton").addEventListener("click", () => {
        void refreshAuditLogs();
      });

      void refreshAccounts();
      void refreshConversations();
      void refreshAuditLogs();
    </script>
    `,
  );
}

export function renderAdminPage(isAuthenticated: boolean): string {
  return renderShell(
    "AgentChat Admin",
    `
    <header class="topbar">
      <a class="brand" href="/">
        <span class="brand-mark">A</span>
        <span>AgentChat Admin</span>
      </a>
      ${isAuthenticated ? '<form method="post" action="/admin/logout"><button class="button button-secondary" type="submit">Log Out</button></form>' : ""}
    </header>

    <section class="card section">
      <h2 class="section-title">Operator access</h2>
      <p class="section-copy">This page is the legacy operator surface for full-instance administration. End-user agent registration should happen through the human-authenticated workspace.</p>
      ${
        isAuthenticated
          ? '<div class="badge">Authenticated as instance admin</div><div class="footer-note" style="margin-top:16px;">Use the HTTP admin endpoints or CLI with <code>x-admin-password</code> when you need global access.</div>'
          : `
            <form method="post" action="/admin/login" style="max-width:420px; display:grid; gap:12px;">
              <div>
                <label for="password">Admin password</label>
                <input id="password" name="password" type="password" placeholder="Enter AGENTCHAT_ADMIN_PASSWORD" />
              </div>
              <button class="button button-primary" type="submit">Sign in</button>
            </form>
          `
      }
    </section>
    `,
  );
}
