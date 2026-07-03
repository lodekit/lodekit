import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({ meta: [{ title: "start fixture" }] }),
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
