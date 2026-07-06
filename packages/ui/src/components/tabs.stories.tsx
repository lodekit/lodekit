import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-96">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tabs-name">Name</Label>
          <Input id="tabs-name" defaultValue="Jane Cooper" />
        </div>
      </TabsContent>
      <TabsContent value="password" className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tabs-password">New password</Label>
          <Input id="tabs-password" type="password" />
        </div>
      </TabsContent>
    </Tabs>
  ),
};
