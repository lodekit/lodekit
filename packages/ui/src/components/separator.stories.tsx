import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "@lodekit/ui";

const meta = {
  title: "Components/Separator",
  component: Separator,
  tags: ["autodocs"],
} satisfies Meta<typeof Separator>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-96">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Lodekit</h4>
        <p className="text-sm text-muted-foreground">
          A local runtime for personal web tools.
        </p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center gap-4 text-sm">
        <span>Apps</span>
        <Separator orientation="vertical" />
        <span>Data</span>
        <Separator orientation="vertical" />
        <span>Settings</span>
      </div>
    </div>
  ),
};
