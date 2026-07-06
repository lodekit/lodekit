import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label, Switch } from "@lodekit/ui";

const meta = {
  title: "Components/Switch",
  component: Switch,
  tags: ["autodocs"],
} satisfies Meta<typeof Switch>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="notifications" defaultChecked />
      <Label htmlFor="notifications">Notifications</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="notifications-disabled" disabled />
      <Label htmlFor="notifications-disabled">Notifications</Label>
    </div>
  ),
};
