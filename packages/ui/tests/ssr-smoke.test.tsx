import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Label,
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
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
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Progress,
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
} from "../src";

// Composite page exercising the full set of standalone-renderable @lodekit/ui
// exports under react-dom/server, in a plain Node environment (no window, no
// document). Purely presentational/context-only pieces (variant fns like
// buttonVariants) are not components and are skipped — see task report.
function Smoke() {
  return (
    <div>
      <Button>Button Marker</Button>

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

      <Select open={false}>
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

      <Dialog open>
        <DialogTrigger asChild>
          <Button>Dialog Trigger Marker</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title Marker</DialogTitle>
            <DialogDescription>Dialog Description Marker</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Alert Dialog Trigger Marker</Button>
        </AlertDialogTrigger>
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

      <Sheet>
        <SheetTrigger asChild>
          <Button>Sheet Trigger Marker</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title Marker</SheetTitle>
            <SheetDescription>Sheet Description Marker</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Drawer>
        <DrawerTrigger asChild>
          <Button>Drawer Trigger Marker</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title Marker</DrawerTitle>
            <DrawerDescription>Drawer Description Marker</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Dropdown Trigger Marker</Button>
        </DropdownMenuTrigger>
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
      </DropdownMenu>

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
        </MenubarMenu>
      </Menubar>

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
      </ContextMenu>

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

      <Popover>
        <PopoverTrigger asChild>
          <Button>Popover Trigger Marker</Button>
        </PopoverTrigger>
        <PopoverAnchor />
        <PopoverContent>
          <PopoverHeader>
            <PopoverTitle>Popover Title Marker</PopoverTitle>
          </PopoverHeader>
          <PopoverDescription>Popover Description Marker</PopoverDescription>
        </PopoverContent>
      </Popover>

      <HoverCard>
        <HoverCardTrigger>Hover Card Trigger Marker</HoverCardTrigger>
        <HoverCardContent>Hover Card Content Marker</HoverCardContent>
      </HoverCard>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Tooltip Trigger Marker</Button>
          </TooltipTrigger>
          <TooltipContent>Tooltip Content Marker</TooltipContent>
        </Tooltip>
      </TooltipProvider>

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
      <CommandDialog open>
        <CommandInput placeholder="Command Dialog Input Marker" />
        <CommandList>
          <CommandEmpty>Nothing found</CommandEmpty>
        </CommandList>
      </CommandDialog>

      <Accordion type="single" collapsible>
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
      <Progress value={42} />
      <Skeleton />
      <Separator />
      <AspectRatio ratio={16 / 9}>
        <div>Aspect Ratio Marker</div>
      </AspectRatio>

      <Toggle>Toggle Marker</Toggle>
      <ToggleGroup type="single" defaultValue="a">
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

      <ResizablePanelGroup orientation="horizontal">
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
  it("the component set renders server-side without touching window", () => {
    expect(typeof window).toBe("undefined");

    const html = renderToString(<Smoke />);

    expect(html.length).toBeGreaterThan(0);

    // Spot-check markers from components whose output isn't gated behind a
    // client-only portal mount (Radix/vaul portals resolve to `null` on the
    // server since they only mount after a layout effect, which never runs
    // during renderToString — see task-7-report.md for the full rationale).
    const expectedMarkers = [
      "Button Marker",
      "Card Title Marker",
      "Card Description Marker",
      "Card Content Marker",
      "Card Footer Marker",
      "Label Marker",
      "Input Placeholder Marker",
      "Textarea Placeholder Marker",
      "Select Placeholder Marker",
      "Dialog Trigger Marker",
      "Alert Dialog Trigger Marker",
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
      "Collapsible Trigger Marker",
      "Tab One Marker",
      "Tab Content Marker",
      "Table Caption Marker",
      "Table Cell Marker",
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
    // stand-alone text (checkbox/switch/skeleton/etc.).
    const expectedDataSlots = [
      'data-slot="checkbox"',
      'data-slot="switch"',
      'data-slot="skeleton"',
      'data-slot="separator"',
      'data-slot="slider"',
      'data-slot="progress"',
      'data-slot="avatar"',
      'data-slot="input-otp-group"',
      'data-slot="toggle-group"',
    ];

    for (const slot of expectedDataSlots) {
      expect(html).toContain(slot);
    }
  });
});
