import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input, Label } from "@lodekit/ui";

const meta = {
  title: "Components/Input",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
};
