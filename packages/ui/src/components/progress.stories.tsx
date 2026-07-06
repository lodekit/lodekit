import type { Meta, StoryObj } from "@storybook/react-vite";
import { Progress } from "@lodekit/ui";

const meta = {
  title: "Components/Progress",
  component: Progress,
  tags: ["autodocs"],
} satisfies Meta<typeof Progress>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Progress value={66} className="w-96" />,
};
