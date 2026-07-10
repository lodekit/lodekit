import { defineSettings, string } from "@lodekit/sdk";

export default defineSettings({
  weather_location: string({
    label: "Weather location",
    description: "The place the Sky Journal fetches weather for, e.g. \"Lisbon,pt\".",
    default: "Lisbon,pt",
  }),
});
