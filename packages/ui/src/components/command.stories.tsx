import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@lodekit/ui";

const meta = {
  title: "Components/Command",
  component: Command,
  tags: ["autodocs"],
} satisfies Meta<typeof Command>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Command className="w-96 rounded-lg border shadow-md">
      <CommandInput placeholder="Search apps..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Apps">
          <CommandItem>Journal</CommandItem>
          <CommandItem>Tasks</CommandItem>
          <CommandItem>Recipes</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>Profile</CommandItem>
          <CommandItem>Preferences</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
