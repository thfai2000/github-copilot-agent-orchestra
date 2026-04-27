# Conversations

Conversations let users chat directly with an agent outside the workflow engine.

## What a Conversation Is

- A conversation is a persisted thread between one user and one selected agent.
- Each conversation belongs to a workspace and is recorded in the database.
- The conversation history is stored as ordered `user` and `assistant` messages, so users can leave and resume later.
- The selected agent can be switched later from the conversation screen, so subsequent turns can continue with a different active agent while keeping the same transcript.

## Starting a Conversation

- Open **Conversations** from the workspace navigation and create a new thread.
- Choose one active agent from the available agent list.
- Optionally provide a title; otherwise OAO generates one automatically.
- Agent detail pages include a **Start Conversation** shortcut that preselects that agent.

## Interactive Behavior

- Messages are stored immediately when the user sends them.
- The assistant response is created as a pending message and then streamed into the UI as deltas arrive.
- Conversation pages subscribe to server-sent events (SSE), so the transcript updates while the agent is still responding.
- The stream can include visible reasoning blocks, reasoning deltas, turn lifecycle markers, and tool execution events so the UI can show what the agent is doing while a turn is running.
- Only one assistant turn can run at a time for a conversation.

## Conversation Controls

- The conversation page can override the next turn's model selection using the active records from the workspace **Models** registry.
- The conversation page can override the next turn's reasoning effort (`low`, `medium`, `high`, `xhigh`) when the chosen model supports it.
- The conversation page can override the agent's tool defaults by selecting or clearing both built-in tools and discovered MCP tools for the next turn.
- These per-turn settings are stored in conversation message metadata so the UI can restore the last-used settings for the thread.

The turn controls live in a compact bar directly below the prompt input, similar to editor-integrated chat tools. Agent, model, and reasoning selectors stay inline, while tools open in a popup tree so the transcript keeps most of the available screen space.

The tool selector uses the same grouped catalog model as the agent editor:

- Built-in tools are grouped by capability area.
- The default OAO Platform MCP server is auto-included.
- Stored MCP servers and template-defined MCP servers appear as separate groups.
- Resetting the selector returns the conversation to the current agent defaults.

## Agent Context

- Conversations use the selected agent's markdown instructions, skills, built-in tools, MCP servers, and scoped variables.
- Workflow-specific tools such as workflow editing and self-scheduling are intentionally excluded from conversation sessions because there is no workflow execution context.
- The same per-agent session lock used by workflow steps also applies to conversations, so an agent cannot run conflicting Copilot sessions at the same time.

## Per-Session Auto-Approval

Each assistant response is its own Copilot SDK session. OAO creates the session with `onPermissionRequest: approveAll`, which means every tool call the agent makes during that session is automatically approved without prompting the user. This applies to both built-in tools (e.g. `read_variables`, `simple_http_request`) and any MCP-provided tools enabled for the conversation.

If the agent needs to ask the user for input mid-session (rather than for tool permission), it should call the **`ask_questions`** built-in tool — see below.

## Asking the User Questions Mid-Session — `ask_questions`

The `ask_questions` built-in tool lets an agent pause its current Copilot session, present the user with a structured form, and resume once the user answers.

- **Question types** — `single_choice`, `multi_choice`, and `free_text` are supported.
- **Choice questions** can set `allowOther: true` to render an "Other" option that reveals a free-text input alongside the chosen value.
- **`required: false`** lets a free-text question be skipped.
- **`introduction`** is shown above the form to give the user context.
- **`timeoutSeconds`** caps how long the agent waits (default 600s, max 3600s). On timeout the tool returns an error and the agent decides how to proceed.

The flow:

1. Agent calls `ask_questions({ questions: [...] })`.
2. OAO emits a `conversation.tool.ask_questions` SSE event with the question payload and a unique `askId`.
3. The conversation page renders the form below the active assistant message.
4. When the user submits, the UI POSTs `/api/conversations/:id/answer-questions` with `{ askId, answers }`.
5. The pending tool call resolves with `{ askId, answers }` and the agent continues its session.

`ask_questions` is only available when the executing context is a conversation — workflow runs cannot invoke it.

## Persistence Model

- `conversations` stores the thread header, selected agent, and timestamps.
- `conversation_messages` stores each turn, its status, any assistant error, and assistant metadata such as agent/model selection, reasoning text, live tool activity, and tool trace.
- If an agent is deleted later, the existing conversation remains readable, but new turns are disabled.

## Typical Use Cases

- Ask an agent ad hoc questions before formalizing the task into a workflow.
- Validate an agent's prompt design interactively from its detail page.
- Keep a lightweight working thread with an agent while still using workflows for repeatable automation.