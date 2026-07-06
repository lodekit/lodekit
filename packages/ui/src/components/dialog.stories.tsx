import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Dialog",
  component: Dialog,
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes and save when you're done.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Make changes and save when you're done.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
