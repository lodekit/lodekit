import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox, Label } from "@lodekit/ui";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
} satisfies Meta<typeof Checkbox>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms-disabled" disabled />
      <Label htmlFor="terms-disabled">Accept terms and conditions</Label>
    </div>
  ),
};
