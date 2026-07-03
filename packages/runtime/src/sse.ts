import type { Response } from "express";

interface Client { res: Response; appId?: string }

const clients = new Set<Client>();

// A client with an app id receives only events broadcast for that app id.
// A client without an app id (the global /api/events channel) receives everything.
export function addClient(res: Response, appId?: string): void {
  const client: Client = { res, appId };
  clients.add(client);
  res.on("close", () => clients.delete(client));
}

export function broadcast(event: string, data: unknown, appId?: string): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.appId === undefined || c.appId === appId) c.res.write(payload);
  }
}
