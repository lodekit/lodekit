import type { Meta, StoryObj } from "@storybook/react-vite";
import { Toaster } from "@lodekit/ui";

// Note: the barrel only re-exports `Toaster`, not sonner's `toast()` function
// (see src/components/sonner.tsx) — no deep import of `sonner` is allowed in
// stories, so this renders the toast host only, without a triggerable demo.
const meta = {
  title: "Components/Sonner",
  component: Toaster,
  tags: ["autodocs"],
} satisfies Meta<typeof Toaster>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Toaster />,
};
