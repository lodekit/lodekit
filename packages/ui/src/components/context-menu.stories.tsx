import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/ContextMenu",
  component: ContextMenu,
  tags: ["autodocs"],
} satisfies Meta<typeof ContextMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="flex h-32 w-96 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Right click this area
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Rename</ContextMenuItem>
        <ContextMenuItem>Duplicate</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
