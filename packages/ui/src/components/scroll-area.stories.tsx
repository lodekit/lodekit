import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea, Separator } from "@lodekit/ui";

const meta = {
  title: "Components/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
} satisfies Meta<typeof ScrollArea>;
export default meta;

type Story = StoryObj<typeof meta>;

const apps = [
  "Journal",
  "Tasks",
  "Recipes",
  "Reading List",
  "Habit Tracker",
  "Expenses",
  "Bookmarks",
  "Contacts",
];

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium">Apps</h4>
        {apps.map((app) => (
          <div key={app}>
            <div className="text-sm">{app}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
