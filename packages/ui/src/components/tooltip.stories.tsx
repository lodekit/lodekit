import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
} satisfies Meta<typeof Tooltip>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>Add to library</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
