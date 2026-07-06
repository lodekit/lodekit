import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Menubar",
  component: Menubar,
  tags: ["autodocs"],
} satisfies Meta<typeof Menubar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Menubar>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            New App <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>Open Folder</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Quit</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            Undo <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>Redo</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  ),
};
