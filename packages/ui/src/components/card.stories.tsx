import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lodekit/ui";

const meta = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Journal</CardTitle>
        <CardDescription>A daily journaling app.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Last edited 2 hours ago. Running on port 4173.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline">Stop</Button>
        <Button>Open</Button>
      </CardFooter>
    </Card>
  ),
};
