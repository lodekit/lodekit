import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Avatar,
  AvatarFallback,
  Button,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/HoverCard",
  component: HoverCard,
  tags: ["autodocs"],
} satisfies Meta<typeof HoverCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant="link">@ulyssesv</Button>
      </HoverCardTrigger>
      <HoverCardContent className="flex gap-3">
        <Avatar>
          <AvatarFallback>UV</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Ulysses</p>
          <p className="text-sm text-muted-foreground">
            Builds personal tools with Lodekit.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
