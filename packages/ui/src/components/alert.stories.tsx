import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertDescription, AlertTitle } from "@lodekit/ui";

const meta = {
  title: "Components/Alert",
  component: Alert,
  tags: ["autodocs"],
} satisfies Meta<typeof Alert>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert className="w-96">
      <AlertTitle>Update available</AlertTitle>
      <AlertDescription>
        A new version of the runtime is ready to install.
      </AlertDescription>
    </Alert>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-4">
      <Alert>
        <AlertTitle>Update available</AlertTitle>
        <AlertDescription>
          A new version of the runtime is ready to install.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Sync failed</AlertTitle>
        <AlertDescription>
          The folder watcher lost its connection. Restart the runtime to
          resume.
        </AlertDescription>
      </Alert>
    </div>
  ),
};
