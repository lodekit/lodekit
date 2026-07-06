import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToggleGroup, ToggleGroupItem } from "@lodekit/ui";

const meta = {
  title: "Components/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  args: { type: "single" },
} satisfies Meta<typeof ToggleGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ToggleGroup type="multiple">
      <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
      <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
      <ToggleGroupItem value="underline">Underline</ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Disabled: Story = {
  render: () => (
    <ToggleGroup type="multiple" disabled>
      <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
      <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
      <ToggleGroupItem value="underline">Underline</ToggleGroupItem>
    </ToggleGroup>
  ),
};
