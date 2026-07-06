import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@lodekit/ui";

const meta = {
  title: "Components/Avatar",
  component: Avatar,
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="Jane Cooper" />
      <AvatarFallback>JC</AvatarFallback>
    </Avatar>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar size="sm">
          <AvatarFallback>JC</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>JC</AvatarFallback>
        </Avatar>
        <Avatar size="lg">
          <AvatarFallback>JC</AvatarFallback>
        </Avatar>
      </div>
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>JC</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>AR</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>MK</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    </div>
  ),
};
