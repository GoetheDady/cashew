export async function resolveConversationIdForSend(
  activeSessionId: string | null,
  createSession: () => Promise<{ id: string } | null>,
): Promise<string | null> {
  if (activeSessionId) return activeSessionId;

  const session = await createSession();
  return session?.id ?? null;
}
