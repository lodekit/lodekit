import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@lodekit/ui";

const meta = {
  title: "Components/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  args: { type: "single" },
} satisfies Meta<typeof Accordion>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-96">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is Lodekit?</AccordionTrigger>
        <AccordionContent>
          A local, self-hosted runtime for building and running your own
          personal web tools.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Where is my data stored?</AccordionTrigger>
        <AccordionContent>
          Each app gets its own SQLite database under your Lodekit root.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Can I run multiple apps?</AccordionTrigger>
        <AccordionContent>
          Yes, the runtime hosts every app in the folder as its own worker
          thread.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
