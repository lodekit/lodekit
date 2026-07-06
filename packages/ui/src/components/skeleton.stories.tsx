import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "@lodekit/ui";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  ),
};
