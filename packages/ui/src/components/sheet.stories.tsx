import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;
export default meta;

type Story = StoryObj<typeof meta>;

const content = (
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Edit profile</SheetTitle>
      <SheetDescription>
        Make changes to your profile and save when you're done.
      </SheetDescription>
    </SheetHeader>
    <div className="flex flex-col gap-4 px-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sheet-name">Name</Label>
        <Input id="sheet-name" defaultValue="Jane Cooper" />
      </div>
    </div>
    <SheetFooter>
      <Button>Save changes</Button>
      <SheetClose asChild>
        <Button variant="outline">Cancel</Button>
      </SheetClose>
    </SheetFooter>
  </SheetContent>
);

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Edit profile</Button>
      </SheetTrigger>
      {content}
    </Sheet>
  ),
};

export const Open: Story = {
  render: () => <Sheet defaultOpen>{content}</Sheet>,
};
