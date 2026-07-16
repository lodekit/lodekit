type Send = (payload: string) => void;

interface Client { send: Send; appId?: string }

const clients = new Set<Client>();

// A client with an appId receives only events broadcast for that app id.
// A client without one (the global /api/events channel) receives everything.
// Returns the remove function; the transport's close/abort callback calls it.
export function addClient(send: Send, appId?: string): () => void {
  const client: Client = { send, appId };
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcast(event: string, data: unknown, appId?: string): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.appId === undefined || c.appId === appId) c.send(payload);
  }
}
