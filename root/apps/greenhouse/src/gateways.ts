import { defineGateways, gateway } from "@lodekit/sdk";

export default defineGateways({
  weather: gateway({
    provider: "openweathermap",
    description: "Daily forecast for the Sky Journal.",
  }),
});
