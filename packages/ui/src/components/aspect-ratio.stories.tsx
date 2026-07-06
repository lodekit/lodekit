import type { Meta, StoryObj } from "@storybook/react-vite";
import { AspectRatio } from "@lodekit/ui";

const meta = {
  title: "Components/AspectRatio",
  component: AspectRatio,
  tags: ["autodocs"],
} satisfies Meta<typeof AspectRatio>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="w-96">
      <AspectRatio ratio={16 / 9}>
        <div className="flex size-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
          16:9 preview
        </div>
      </AspectRatio>
    </div>
  ),
};
