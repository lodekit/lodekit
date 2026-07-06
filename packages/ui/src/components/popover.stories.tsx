import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Popover",
  component: Popover,
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>;
export default meta;

type Story = StoryObj<typeof meta>;

const content = (
  <PopoverContent className="w-72">
    <PopoverHeader>
      <PopoverTitle>Dimensions</PopoverTitle>
      <PopoverDescription>Set the app window's default size.</PopoverDescription>
    </PopoverHeader>
    <div className="mt-3 flex flex-col gap-2">
      <div className="grid grid-cols-3 items-center gap-2">
        <Label htmlFor="width">Width</Label>
        <Input id="width" defaultValue="960" className="col-span-2 h-8" />
      </div>
      <div className="grid grid-cols-3 items-center gap-2">
        <Label htmlFor="height">Height</Label>
        <Input id="height" defaultValue="640" className="col-span-2 h-8" />
      </div>
    </div>
  </PopoverContent>
);

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      {content}
    </Popover>
  ),
};

export const Open: Story = {
  render: () => <Popover defaultOpen>{content}</Popover>,
};
