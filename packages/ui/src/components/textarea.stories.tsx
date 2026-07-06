import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label, Textarea } from "@lodekit/ui";

const meta = {
  title: "Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
} satisfies Meta<typeof Textarea>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-1.5">
      <Label htmlFor="message">Message</Label>
      <Textarea id="message" placeholder="Type your message here." />
    </div>
  ),
};
