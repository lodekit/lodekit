import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@lodekit/ui";

const meta = {
  title: "Components/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
} satisfies Meta<typeof Sidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="h-96 w-64 relative overflow-hidden rounded-lg border">
      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarHeader>
            <span className="px-2 text-sm font-semibold">Lodekit</span>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Apps</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>Journal</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Tasks</SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>Recipes</SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </div>
  ),
};
