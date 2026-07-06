import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Collapsible",
  component: Collapsible,
  tags: ["autodocs"],
} satisfies Meta<typeof Collapsible>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible defaultOpen className="w-96">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">3 apps installed</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            Toggle
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 flex flex-col gap-2">
        <div className="rounded-md border px-3 py-2 text-sm">Journal</div>
        <div className="rounded-md border px-3 py-2 text-sm">Tasks</div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
