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

// Inline SVG portrait placeholder — the packaged catalog must render without network.
const placeholderPortrait =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%236366f1'/%3E%3Ccircle cx='32' cy='26' r='11' fill='white'/%3E%3Cpath d='M10 60c2-13 11-19 22-19s20 6 22 19z' fill='white'/%3E%3C/svg%3E";

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src={placeholderPortrait} alt="Jane Cooper" />
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
