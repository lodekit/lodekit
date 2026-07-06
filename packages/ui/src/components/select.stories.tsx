import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@lodekit/ui";

const meta = {
  title: "Components/Select",
  component: Select,
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;
export default meta;

type Story = StoryObj<typeof meta>;

const options = (
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Timezones</SelectLabel>
      <SelectItem value="pt">Pacific Time</SelectItem>
      <SelectItem value="mt">Mountain Time</SelectItem>
      <SelectItem value="ct">Central Time</SelectItem>
      <SelectItem value="et">Eastern Time</SelectItem>
    </SelectGroup>
  </SelectContent>
);

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a timezone" />
      </SelectTrigger>
      {options}
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a timezone" />
      </SelectTrigger>
      {options}
    </Select>
  ),
};
