import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertAction,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  AspectRatio,
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  Badge,
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxTrigger,
  ComboboxValue,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Kbd,
  KbdGroup,
  Label,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  ProgressLabel,
  ProgressValue,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  ScrollBar,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  Skeleton,
  Slider,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toaster,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useComboboxAnchor,
} from "../src";

// Composite page exercising the full set of standalone-renderable @lodekit/ui
// exports under react-dom/server, in a plain Node environment (no window, no
// document). These are Base UI (base-nova) primitives, not Radix — no
// `asChild`; state is exposed via `data-open`/`data-closed`/`data-checked`
// etc.; portal-backed popups (Dialog/Sheet/Drawer/Menu/Select/Combobox/
// Popover/HoverCard/Tooltip/NavigationMenu) gate their popup subtree on a
// `mounted` store value that is only set true from a client-side effect —
// under `renderToString` it stays false, so `*Portal` components return
// `null` and everything inside them (headers, items, etc.) never actually
// executes its render body. Only the always-visible trigger markers are
// asserted for those; the gated subtrees are still composed (matching real
// usage) so the wrapper functions up to the Portal are exercised, and are
// called out with a comment at each site. Purely presentational/context-only
// exports that aren't components (`buttonVariants`, `badgeVariants`,
// `buttonGroupVariants`, `navigationMenuTriggerStyle`, `tabsListVariants`,
// `toggleVariants`) are skipped — see task report. `useSidebar` is exercised
// indirectly (every Sidebar part requires the provider); `useComboboxAnchor`
// is called directly below since it's a plain ref hook.
function Smoke() {
  const comboboxAnchorRef = useComboboxAnchor();

  return (
    <div>
      <Button>Button Marker</Button>

      <ButtonGroup>
        <Button variant="outline">A</Button>
        <ButtonGroupSeparator />
        <ButtonGroupText>Button Group Text Marker</ButtonGroupText>
      </ButtonGroup>

      <Card>
        <CardHeader>
          <CardTitle>Card Title Marker</CardTitle>
          <CardDescription>Card Description Marker</CardDescription>
          <CardAction>
            <Button size="sm">Card Action</Button>
          </CardAction>
        </CardHeader>
        <CardContent>Card Content Marker</CardContent>
        <CardFooter>Card Footer Marker</CardFooter>
      </Card>

      <Label htmlFor="smoke-input">Label Marker</Label>
      <Input id="smoke-input" placeholder="Input Placeholder Marker" />
      <Textarea placeholder="Textarea Placeholder Marker" />

      <FieldSet>
        <FieldLegend>Field Legend Marker</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="field-input">Field Label Marker</FieldLabel>
            <FieldContent>
              <Input id="field-input" />
              <FieldDescription>Field Description Marker</FieldDescription>
              <FieldError errors={[{ message: "Field Error Marker" }]} />
            </FieldContent>
          </Field>
          <FieldSeparator>Field Separator Marker</FieldSeparator>
          <Field orientation="horizontal">
            <FieldTitle>Field Title Marker</FieldTitle>
          </Field>
        </FieldGroup>
      </FieldSet>

      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>Input Group Text Marker</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Input Group Input Marker" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Go</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea placeholder="Input Group Textarea Marker" />
      </InputGroup>

      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>

      <Spinner />

      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" />
          <EmptyTitle>Empty Title Marker</EmptyTitle>
          <EmptyDescription>Empty Description Marker</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>Empty Content Marker</EmptyContent>
      </Empty>

      {/* Select's popup content is portal-gated (see file header) — the
          trigger/value is the only piece that renders under SSR. */}
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select Placeholder Marker" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Select Group Marker</SelectLabel>
            <SelectItem value="one">One</SelectItem>
            <SelectSeparator />
          </SelectGroup>
        </SelectContent>
      </Select>

      {/* Combobox: input-flavored, single-select. ComboboxContent is
          portal-gated; ComboboxTrigger is exercised internally by
          ComboboxInput (showTrigger default true). */}
      <Combobox items={["Apple", "Banana", "Cherry"]}>
        <ComboboxInput placeholder="Combobox Input Marker" />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxLabel>Combobox Group Marker</ComboboxLabel>
              <ComboboxItem value="Apple">Apple</ComboboxItem>
            </ComboboxGroup>
            <ComboboxSeparator />
            <ComboboxEmpty>Combobox Empty Marker</ComboboxEmpty>
            <ComboboxCollection>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {/* Combobox: trigger/value flavored (select-style, no free text
          input). */}
      <Combobox items={["One", "Two"]}>
        <ComboboxTrigger>
          <ComboboxValue placeholder="Combobox Value Marker" />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="One">One</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {/* Combobox: chips-flavored, multiple-select. ComboboxChips is the
          always-visible input surface (not portal-gated), unlike
          ComboboxContent. */}
      <Combobox items={["Red", "Green", "Blue"]} multiple>
        <ComboboxChips>
          <ComboboxChip>Combobox Chip Marker</ComboboxChip>
          <ComboboxChipsInput placeholder="Combobox Chips Input Marker" />
        </ComboboxChips>
        <ComboboxContent anchor={comboboxAnchorRef}>
          <ComboboxList>
            <ComboboxItem value="Red">Red</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {/* Dialog's popup content is portal-gated (see file header). */}
      <Dialog>
        <DialogTrigger>Dialog Trigger Marker</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title Marker</DialogTitle>
            <DialogDescription>Dialog Description Marker</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog's popup content is portal-gated (see file header). */}
      <AlertDialog>
        <AlertDialogTrigger>Alert Dialog Trigger Marker</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alert Dialog Title Marker</AlertDialogTitle>
            <AlertDialogDescription>
              Alert Dialog Description Marker
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* AlertDialogMedia normally sits inside AlertDialogHeader, but that
          subtree is portal-gated (never invoked server-side), so render it
          standalone too — it is a plain context-free div — to actually
          execute its render body under SSR. */}
      <AlertDialogMedia>Alert Dialog Media Marker</AlertDialogMedia>

      {/* Sheet's popup content is portal-gated (see file header). */}
      <Sheet>
        <SheetTrigger>Sheet Trigger Marker</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title Marker</SheetTitle>
            <SheetDescription>Sheet Description Marker</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Drawer's popup content is portal-gated (see file header);
          showSwipeHandle exercises DrawerSwipeHandle. */}
      <Drawer showSwipeHandle>
        <DrawerTrigger>Drawer Trigger Marker</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title Marker</DrawerTitle>
            <DrawerDescription>Drawer Description Marker</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose>Close</DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* DropdownMenu's popup content is portal-gated (see file header). */}
      <DropdownMenu>
        <DropdownMenuTrigger>Dropdown Trigger Marker</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Dropdown Label Marker</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem>Item</DropdownMenuItem>
            <DropdownMenuCheckboxItem checked>Checked</DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a">A</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Sub</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Sub Item</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
        {/* DropdownMenuContent uses the primitive portal internally, so
            exercise the exported DropdownMenuPortal wrapper directly too.
            Gated (see file header) → emits nothing, but its render body
            still executes. */}
        <DropdownMenuPortal>
          <div>dropdown portal child</div>
        </DropdownMenuPortal>
      </DropdownMenu>

      {/* Menubar's popup content is portal-gated (see file header). */}
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>Menubar Trigger Marker</MenubarTrigger>
          <MenubarContent>
            <MenubarGroup>
              <MenubarItem>Item</MenubarItem>
              <MenubarCheckboxItem checked>Checked</MenubarCheckboxItem>
            </MenubarGroup>
            <MenubarRadioGroup value="a">
              <MenubarRadioItem value="a">A</MenubarRadioItem>
            </MenubarRadioGroup>
            <MenubarLabel>Label</MenubarLabel>
            <MenubarSeparator />
            <MenubarShortcut>⌘K</MenubarShortcut>
            <MenubarSub>
              <MenubarSubTrigger>Sub</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>Sub Item</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
          <MenubarPortal>
            <div>menubar portal child</div>
          </MenubarPortal>
        </MenubarMenu>
      </Menubar>

      {/* ContextMenu's popup content is portal-gated (see file header). */}
      <ContextMenu>
        <ContextMenuTrigger>Context Menu Trigger Marker</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem>Item</ContextMenuItem>
            <ContextMenuCheckboxItem checked>Checked</ContextMenuCheckboxItem>
          </ContextMenuGroup>
          <ContextMenuRadioGroup value="a">
            <ContextMenuRadioItem value="a">A</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuLabel>Label</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuShortcut>⌘K</ContextMenuShortcut>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Sub</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Sub Item</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
        {/* Same rationale as DropdownMenuPortal above. */}
        <ContextMenuPortal>
          <div>context menu portal child</div>
        </ContextMenuPortal>
      </ContextMenu>

      {/* NavigationMenuContent (the per-item popup panel) is portal-gated
          (see file header); NavigationMenuIndicator is a plain underline
          element and is not gated. */}
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Nav Trigger Marker</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#">Nav Link Marker</NavigationMenuLink>
            </NavigationMenuContent>
            <NavigationMenuIndicator />
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      {/* Popover's popup content is portal-gated (see file header). */}
      <Popover>
        <PopoverTrigger>Popover Trigger Marker</PopoverTrigger>
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Popover Title Marker</PopoverTitle>
          </PopoverHeader>
          <PopoverDescription>Popover Description Marker</PopoverDescription>
        </PopoverContent>
      </Popover>

      {/* HoverCard's popup content is portal-gated (see file header). */}
      <HoverCard>
        <HoverCardTrigger>Hover Card Trigger Marker</HoverCardTrigger>
        <HoverCardContent>Hover Card Content Marker</HoverCardContent>
      </HoverCard>

      {/* Tooltip's popup content is portal-gated (see file header). */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Tooltip Trigger Marker</TooltipTrigger>
          <TooltipContent>Tooltip Content Marker</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Command (cmdk) is not portal-based — its list renders directly. */}
      <Command>
        <CommandInput placeholder="Command Input Marker" />
        <CommandList>
          <CommandEmpty>Command Empty Marker</CommandEmpty>
          <CommandGroup heading="Group">
            <CommandItem>Command Item Marker</CommandItem>
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandGroup>
          <CommandSeparator />
        </CommandList>
      </Command>
      {/* CommandDialog's list sits in a Dialog's portal-gated content (see
          file header) — only its sr-only header (rendered outside the
          portal, directly under Dialog's root context) executes. */}
      <CommandDialog open>
        <CommandInput placeholder="Command Dialog Input Marker" />
        <CommandList>
          <CommandEmpty>Nothing found</CommandEmpty>
        </CommandList>
      </CommandDialog>

      <Accordion defaultValue={["item-1"]}>
        <AccordionItem value="item-1">
          <AccordionTrigger>Accordion Trigger Marker</AccordionTrigger>
          <AccordionContent>Accordion Content Marker</AccordionContent>
        </AccordionItem>
      </Accordion>

      <Collapsible>
        <CollapsibleTrigger>Collapsible Trigger Marker</CollapsibleTrigger>
        <CollapsibleContent>Collapsible Content Marker</CollapsibleContent>
      </Collapsible>

      <Tabs defaultValue="tab-1">
        <TabsList>
          <TabsTrigger value="tab-1">Tab One Marker</TabsTrigger>
          <TabsTrigger value="tab-2">Tab Two</TabsTrigger>
        </TabsList>
        <TabsContent value="tab-1">Tab Content Marker</TabsContent>
        <TabsContent value="tab-2">Tab Two Content</TabsContent>
      </Tabs>

      <Table>
        <TableCaption>Table Caption Marker</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Head Marker</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Table Cell Marker</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Footer Cell</TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <Badge>Badge Marker</Badge>
      <Checkbox />
      <Switch />

      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" />
        <RadioGroupItem value="b" />
      </RadioGroup>

      <Slider defaultValue={[50]} />
      <Progress value={42}>
        <ProgressLabel>Progress Label Marker</ProgressLabel>
        <ProgressValue />
      </Progress>
      <Skeleton />
      <Separator />
      <AspectRatio ratio={16 / 9}>
        <div>Aspect Ratio Marker</div>
      </AspectRatio>

      <Toggle>Toggle Marker</Toggle>
      <ToggleGroup defaultValue={["a"]}>
        <ToggleGroupItem value="a">A</ToggleGroupItem>
        <ToggleGroupItem value="b">B</ToggleGroupItem>
      </ToggleGroup>

      <Avatar>
        <AvatarImage src="/avatar.png" alt="Avatar Marker" />
        <AvatarFallback>AV</AvatarFallback>
        <AvatarBadge>1</AvatarBadge>
      </Avatar>
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>Avatar Fallback Marker</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>

      <Alert>
        <AlertTitle>Alert Title Marker</AlertTitle>
        <AlertDescription>Alert Description Marker</AlertDescription>
        <AlertAction>
          <Button size="sm">Dismiss</Button>
        </AlertAction>
      </Alert>

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Breadcrumb Link Marker</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Breadcrumb Page Marker</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbList>
      </Breadcrumb>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">Pagination Link Marker</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <ResizablePanelGroup>
        <ResizablePanel>Resizable Panel Marker</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel>Second Panel</ResizablePanel>
      </ResizablePanelGroup>

      <ScrollArea>
        <div>Scroll Area Marker</div>
        <ScrollBar />
      </ScrollArea>

      <InputOTP maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSeparator />
          <InputOTPSlot index={1} />
        </InputOTPGroup>
      </InputOTP>

      <Toaster />

      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarHeader>Sidebar Header Marker</SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Sidebar Group Label Marker</SidebarGroupLabel>
              <SidebarGroupAction>Action</SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Sidebar Menu Button Marker</SidebarMenuButton>
                    <SidebarMenuAction>Action</SidebarMenuAction>
                    <SidebarMenuBadge>1</SidebarMenuBadge>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="#">
                          Sidebar Sub Button Marker
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarInput placeholder="Sidebar Input Marker" />
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter>Sidebar Footer Marker</SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <SidebarTrigger />
          Sidebar Inset Marker
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

describe("SSR smoke", () => {
  it("the full base-nova component set renders server-side without touching window", () => {
    expect(typeof window).toBe("undefined");

    const html = renderToString(<Smoke />);

    expect(html.length).toBeGreaterThan(0);

    // Spot-check markers from components whose output isn't gated behind a
    // client-only portal mount (see the file-header comment for why the
    // popup-based components below only contribute their trigger markers).
    const expectedMarkers = [
      "Button Marker",
      "Button Group Text Marker",
      "Card Title Marker",
      "Card Description Marker",
      "Card Content Marker",
      "Card Footer Marker",
      "Label Marker",
      "Input Placeholder Marker",
      "Textarea Placeholder Marker",
      "Field Legend Marker",
      "Field Label Marker",
      "Field Description Marker",
      "Field Error Marker",
      "Field Separator Marker",
      "Field Title Marker",
      "Input Group Text Marker",
      "Input Group Input Marker",
      "Input Group Textarea Marker",
      "Empty Title Marker",
      "Empty Description Marker",
      "Empty Content Marker",
      "Select Placeholder Marker",
      "Combobox Input Marker",
      "Combobox Value Marker",
      "Combobox Chip Marker",
      "Combobox Chips Input Marker",
      "Dialog Trigger Marker",
      "Alert Dialog Trigger Marker",
      "Alert Dialog Media Marker",
      "Sheet Trigger Marker",
      "Drawer Trigger Marker",
      "Dropdown Trigger Marker",
      "Menubar Trigger Marker",
      "Context Menu Trigger Marker",
      "Nav Trigger Marker",
      "Popover Trigger Marker",
      "Hover Card Trigger Marker",
      "Tooltip Trigger Marker",
      "Command Input Marker",
      "Accordion Trigger Marker",
      "Accordion Content Marker",
      "Collapsible Trigger Marker",
      "Tab One Marker",
      "Tab Content Marker",
      "Table Caption Marker",
      "Table Cell Marker",
      "Progress Label Marker",
      "Badge Marker",
      "Aspect Ratio Marker",
      "Toggle Marker",
      "Avatar Fallback Marker",
      "Alert Title Marker",
      "Alert Description Marker",
      "Breadcrumb Link Marker",
      "Breadcrumb Page Marker",
      "Pagination Link Marker",
      "Resizable Panel Marker",
      "Scroll Area Marker",
      "Sidebar Header Marker",
      "Sidebar Group Label Marker",
      "Sidebar Menu Button Marker",
      "Sidebar Sub Button Marker",
      "Sidebar Footer Marker",
      "Sidebar Inset Marker",
    ];

    for (const marker of expectedMarkers) {
      expect(html).toContain(marker);
    }

    // data-slot attributes for components rendered without meaningful
    // stand-alone text.
    const expectedDataSlots = [
      'data-slot="checkbox"',
      'data-slot="switch"',
      'data-slot="skeleton"',
      'data-slot="separator"',
      'data-slot="slider"',
      'data-slot="progress"',
      'data-slot="progress-value"',
      'data-slot="avatar"',
      'data-slot="input-otp-group"',
      'data-slot="toggle-group"',
      'data-slot="kbd"',
      'data-slot="spinner"',
      'data-slot="empty"',
      'data-slot="navigation-menu-indicator"',
    ];

    for (const slot of expectedDataSlots) {
      expect(html).toContain(slot);
    }
  });
});
