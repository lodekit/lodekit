import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toggle } from "@lodekit/ui";

const meta = {
  title: "Components/Toggle",
  component: Toggle,
  tags: ["autodocs"],
} satisfies Meta<typeof Toggle>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Bold" } };

export const Disabled: Story = {
  args: { children: "Bold", disabled: true },
};
