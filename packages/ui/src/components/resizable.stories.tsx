import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@lodekit/ui";

const meta = {
  title: "Components/Resizable",
  component: ResizablePanelGroup,
  tags: ["autodocs"],
} satisfies Meta<typeof ResizablePanelGroup>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="h-48 w-96">
      <ResizablePanelGroup orientation="horizontal" className="rounded-lg border">
        <ResizablePanel defaultSize={30}>
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sidebar
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70}>
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Content
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  ),
};
