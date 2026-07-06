import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "@lodekit/ui";

const meta = {
  title: "Components/AlertDialog",
  component: AlertDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof AlertDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete app</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this app?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the app and its data from your Lodekit root. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const Open: Story = {
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this app?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the app and its data from your Lodekit root. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};
