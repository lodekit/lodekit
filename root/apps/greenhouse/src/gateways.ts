import { defineGateways, gateway } from "@lodekit/sdk";

export default defineGateways({
  weather: gateway({
    provider: "openweathermap",
    description: "Daily forecast for the Sky Journal.",
  }),
  oauth_demo: gateway({
    provider: "duende-demo",
    description: "OAuth 2.0 rail demo against Duende's public IdentityServer.",
  }),
});
