import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/NavigationMenu",
  component: NavigationMenu,
  tags: ["autodocs"],
} satisfies Meta<typeof NavigationMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Apps</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-64 gap-1 p-2">
              <li>
                <NavigationMenuLink href="/apps/journal">
                  Journal
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="/apps/tasks">
                  Tasks
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/settings">Settings</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  ),
};
