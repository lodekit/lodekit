import type { Meta, StoryObj } from "@storybook/react-vite";
import { Slider } from "@lodekit/ui";

const meta = {
  title: "Components/Slider",
  component: Slider,
  tags: ["autodocs"],
} satisfies Meta<typeof Slider>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Slider defaultValue={[50]} max={100} step={1} className="w-96" />,
};

export const Disabled: Story = {
  render: () => (
    <Slider defaultValue={[50]} max={100} step={1} disabled className="w-96" />
  ),
};
