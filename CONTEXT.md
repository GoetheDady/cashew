# Cashew

Cashew is a local-first personal agent desktop app. Its current product surface is a focused chat experience with saved conversation history.

## Language

**Conversation**:
A saved chat thread containing an ordered set of messages between the user and Cashew. A conversation appears in conversation history and can be reopened later.
_Avoid_: Session, chat record

**Conversation History**:
The list of saved **Conversations** shown in the sidebar. It is navigation for returning to previous chats, not a general activity feed.
_Avoid_: Recent activity, workspace history

**Sidebar**:
The left-hand column that contains the Cashew brand, the new chat action, and **Conversation History**. It is not a module launcher.
_Avoid_: App navigation, workspace switcher

**Chat Surface**:
The main area where the active **Conversation** is read and continued. It contains the message list and the composer.
_Avoid_: Workspace, dashboard

**Empty Chat**:
The state of the **Chat Surface** when no **Conversation** is active yet. It still lets the user type a first message, which starts a new **Conversation**.
_Avoid_: Blank workspace, onboarding screen

## Process Architecture

**Daemon**:
The background process that holds the agent runtime, LLM calls, and SQLite database. It exposes an HTTP + SSE API consumed by the **Desktop** frontend. It runs independently of the UI — closing the window does not stop it.
_Avoid_: Backend, server, agent process

**Desktop**:
The Electron application that presents the user interface. It connects to the **Daemon** over `localhost` and has no direct access to the database or the filesystem beyond what the **Daemon** exposes.
_Avoid_: Frontend, renderer, UI shell

**Quit**:
The explicit action of shutting down both **Desktop** and **Daemon** together. Distinct from closing the window, which leaves the **Daemon** running.
_Avoid_: Close, exit (ambiguous)

## Example Dialogue

Developer: Should the sidebar show tools and settings too?

Domain expert: Not yet. The sidebar is Conversation History for reopening Conversations.

Developer: Where does the user type a new request?

Domain expert: In the Chat Surface for the active Conversation.

Developer: What if there is no active Conversation?

Domain expert: Show Empty Chat and let the user send the first message.
