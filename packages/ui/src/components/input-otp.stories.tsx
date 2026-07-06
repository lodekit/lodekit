import type { Meta, StoryObj } from "@storybook/react-vite";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@lodekit/ui";

const meta = {
  title: "Components/InputOTP",
  component: InputOTP,
  tags: ["autodocs"],
  args: { maxLength: 6, children: null },
} satisfies Meta<typeof InputOTP>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <InputOTP maxLength={6}>
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  ),
};
