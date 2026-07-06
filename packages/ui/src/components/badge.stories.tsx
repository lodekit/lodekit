import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@lodekit/ui";

const meta = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
} satisfies Meta<typeof Badge>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: "Running" } };

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Running</Badge>
      <Badge variant="secondary">Idle</Badge>
      <Badge variant="destructive">Failed</Badge>
      <Badge variant="outline">Draft</Badge>
      <Badge variant="ghost">Archived</Badge>
      <Badge variant="link">Details</Badge>
    </div>
  ),
};
