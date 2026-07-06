import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input, Label } from "@lodekit/ui";

const meta = {
  title: "Components/Label",
  component: Label,
  tags: ["autodocs"],
} satisfies Meta<typeof Label>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-1.5">
      <Label htmlFor="name">Name</Label>
      <Input id="name" placeholder="Jane Cooper" />
    </div>
  ),
};
