import type { Response } from "express";

interface Client { res: Response; slug?: string }

const clients = new Set<Client>();

// A client with a slug receives only events broadcast for that slug.
// A client without a slug (the global /api/events channel) receives everything.
export function addClient(res: Response, slug?: string): void {
  const client: Client = { res, slug };
  clients.add(client);
  res.on("close", () => clients.delete(client));
}

export function broadcast(event: string, data: unknown, slug?: string): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.slug === undefined || c.slug === slug) c.res.write(payload);
  }
}
