import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label, RadioGroup, RadioGroupItem } from "@lodekit/ui";

const meta = {
  title: "Components/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
} satisfies Meta<typeof RadioGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="all">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="all" id="notify-all" />
        <Label htmlFor="notify-all">All new messages</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="direct" id="notify-direct" />
        <Label htmlFor="notify-direct">Direct messages only</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="none" id="notify-none" />
        <Label htmlFor="notify-none">Nothing</Label>
      </div>
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <RadioGroup defaultValue="all" disabled>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="all" id="notify-all-disabled" />
        <Label htmlFor="notify-all-disabled">All new messages</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="direct" id="notify-direct-disabled" />
        <Label htmlFor="notify-direct-disabled">Direct messages only</Label>
      </div>
    </RadioGroup>
  ),
};
