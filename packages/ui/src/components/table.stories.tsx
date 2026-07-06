import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lodekit/ui";

const meta = {
  title: "Components/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;
export default meta;

type Story = StoryObj<typeof meta>;

const apps = [
  { name: "Journal", status: "Running", lastRun: "2 hours ago" },
  { name: "Tasks", status: "Running", lastRun: "10 minutes ago" },
  { name: "Recipes", status: "Stopped", lastRun: "3 days ago" },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Apps in your Lodekit root.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last run</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {apps.map((app) => (
          <TableRow key={app.name}>
            <TableCell className="font-medium">{app.name}</TableCell>
            <TableCell>{app.status}</TableCell>
            <TableCell>{app.lastRun}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
