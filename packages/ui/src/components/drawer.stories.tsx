import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Drawer",
  component: Drawer,
  tags: ["autodocs"],
} satisfies Meta<typeof Drawer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Restart runtime?</DrawerTitle>
          <DrawerDescription>
            Running apps will be interrupted until the runtime comes back up.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Restart</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
};

export const Open: Story = {
  render: () => (
    <Drawer defaultOpen>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Restart runtime?</DrawerTitle>
          <DrawerDescription>
            Running apps will be interrupted until the runtime comes back up.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Restart</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
};
