# Fluent UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all shadcn/ui components to Fluent UI React v9, maintaining identical functionality and visual appearance.

**Architecture:** Incremental migration from shadcn/ui to Fluent UI. Each task migrates one component type, updating all consumer files. The Sidebar is already migrated (reference implementation). Components are migrated in order of usage frequency (most-used first) to catch breaking changes early.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 3.4, Fluent UI React v9, TanStack Table v8

## Global Constraints

- Desktop-first responsive design (already implemented)
- Preserve existing glassmorphism design language
- Maintain all existing functionality
- Fluent UI components must match existing visual appearance
- Keep Tailwind for layout/spacing, Fluent UI for component behavior
- One component migration per task for clean rollback

## Component Migration Order (by usage count)

| Priority | Component | Fluent UI Equivalent | Files |
|----------|-----------|---------------------|-------|
| 1 | button | Button | 39 |
| 2 | badge | Badge | 34 |
| 3 | card | Card | 31 |
| 4 | input | Input | 31 |
| 5 | label | Label | 23 |
| 6 | sheet | Drawer | 23 |
| 7 | skeleton | Skeleton | ~20 |
| 8 | confirm-dialog | Dialog + Button | 17 |
| 9 | dropdown-menu | Menu | 7 |
| 10 | dialog | Dialog | 7 |
| 11 | tabs | TabList/Tab | 3 |
| 12 | textarea | Textarea | 3 |
| 13 | avatar | Avatar | 3 |
| 14 | tooltip | Tooltip | 2 |
| 15 | chip-input | Custom (keep) | 2 |
| 16 | data-table | Custom (keep) | 9 |
| 17 | table | Table | 1 |

---

## Task 1: Migrate Button Component

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: All 39 files importing Button

**Interfaces:**
- Consumes: existing Button component API
- Produces: Fluent UI Button wrapper with same API

- [ ] **Step 1: Create Fluent UI Button wrapper**

Create `src/components/ui/fluent-button.tsx`:

```tsx
import React from 'react';
import { Button as FluentButton, type ButtonProps as FluentButtonProps } from '@fluentui/react-components';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends Omit<FluentButtonProps, 'appearance' | 'size'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const variantMap: Record<ButtonVariant, FluentButtonProps['appearance']> = {
  default: 'primary',
  destructive: 'primary',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'transparent',
  link: 'transparent',
};

const sizeMap: Record<ButtonSize, FluentButtonProps['size']> = {
  default: 'medium',
  sm: 'small',
  lg: 'large',
  icon: 'medium',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', children, ...props }, ref) => {
    return (
      <FluentButton
        ref={ref}
        appearance={variantMap[variant]}
        size={sizeMap[size]}
        className={className}
        {...props}
      >
        {children}
      </FluentButton>
    );
  }
);
Button.displayName = 'Button';

export { Button };
export type { ButtonProps };
```

- [ ] **Step 2: Update button.tsx to re-export**

Replace `src/components/ui/button.tsx` content with:

```tsx
export { Button } from './fluent-button';
export type { ButtonProps } from './fluent-button';
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Run tests**

```bash
bun run test
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/fluent-button.tsx
git commit -m "feat: migrate Button component to Fluent UI"
```

---

## Task 2: Migrate Badge Component

**Files:**
- Modify: `src/components/ui/badge.tsx`
- Create: `src/components/ui/fluent-badge.tsx`

**Interfaces:**
- Consumes: existing Badge component API
- Produces: Fluent UI Badge wrapper with same API

- [ ] **Step 1: Create Fluent UI Badge wrapper**

Create `src/components/ui/fluent-badge.tsx`:

```tsx
import React from 'react';
import { Badge as FluentBadge, type BadgeProps as FluentBadgeProps } from '@fluentui/react-components';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success';

interface BadgeProps extends Omit<FluentBadgeProps, 'appearance' | 'color'> {
  variant?: BadgeVariant;
}

const variantMap: Record<BadgeVariant, { appearance: FluentBadgeProps['appearance']; color: FluentBadgeProps['color'] }> = {
  default: { appearance: 'filled', color: 'brand' },
  secondary: { appearance: 'tint', color: 'informative' },
  destructive: { appearance: 'filled', color: 'danger' },
  outline: { appearance: 'outline', color: 'brand' },
  success: { appearance: 'filled', color: 'success' },
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const { appearance, color } = variantMap[variant];
    return (
      <FluentBadge
        ref={ref}
        appearance={appearance}
        color={color}
        className={className}
        {...props}
      >
        {children}
      </FluentBadge>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
export type { BadgeProps };
```

- [ ] **Step 2: Update badge.tsx to re-export**

```tsx
export { Badge } from './fluent-badge';
export type { BadgeProps } from './fluent-badge';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/fluent-badge.tsx
git commit -m "feat: migrate Badge component to Fluent UI"
```

---

## Task 3: Migrate Card Component

**Files:**
- Modify: `src/components/ui/card.tsx`
- Create: `src/components/ui/fluent-card.tsx`

**Interfaces:**
- Consumes: existing Card component API (Card, CardHeader, CardContent, CardFooter)
- Produces: Fluent UI Card wrapper with same API

- [ ] **Step 1: Create Fluent UI Card wrapper**

Create `src/components/ui/fluent-card.tsx`:

```tsx
import React from 'react';
import {
  Card as FluentCard,
  CardHeader as FluentCardHeader,
  CardPreview as FluentCardPreview,
} from '@fluentui/react-components';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <FluentCard ref={ref} className={className} {...props}>
      {children}
    </FluentCard>
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);
CardHeader.displayName = 'CardHeader';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardContent, CardFooter };
```

- [ ] **Step 2: Update card.tsx to re-export**

```tsx
export { Card, CardHeader, CardContent, CardFooter } from './fluent-card';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/fluent-card.tsx
git commit -m "feat: migrate Card component to Fluent UI"
```

---

## Task 4: Migrate Input Component

**Files:**
- Modify: `src/components/ui/input.tsx`
- Create: `src/components/ui/fluent-input.tsx`

**Interfaces:**
- Consumes: existing Input component API
- Produces: Fluent UI Input wrapper with same API

- [ ] **Step 1: Create Fluent UI Input wrapper**

Create `src/components/ui/fluent-input.tsx`:

```tsx
import React from 'react';
import { Input as FluentInput, type InputProps as FluentInputProps } from '@fluentui/react-components';

interface InputProps extends Omit<FluentInputProps, 'size'> {
  size?: 'default' | 'sm' | 'lg';
}

const sizeMap: Record<NonNullable<InputProps['size']>, FluentInputProps['size']> = {
  default: 'medium',
  sm: 'small',
  lg: 'large',
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'default', ...props }, ref) => (
    <FluentInput
      ref={ref}
      size={sizeMap[size]}
      className={className}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
export type { InputProps };
```

- [ ] **Step 2: Update input.tsx to re-export**

```tsx
export { Input } from './fluent-input';
export type { InputProps } from './fluent-input';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/fluent-input.tsx
git commit -m "feat: migrate Input component to Fluent UI"
```

---

## Task 5: Migrate Label Component

**Files:**
- Modify: `src/components/ui/label.tsx`
- Create: `src/components/ui/fluent-label.tsx`

**Interfaces:**
- Consumes: existing Label component API
- Produces: Fluent UI Label wrapper

- [ ] **Step 1: Create Fluent UI Label wrapper**

Create `src/components/ui/fluent-label.tsx`:

```tsx
import React from 'react';
import { Label as FluentLabel, type LabelProps as FluentLabelProps } from '@fluentui/react-components';

interface LabelProps extends FluentLabelProps {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, ...props }, ref) => (
    <FluentLabel ref={ref} className={className} {...props}>
      {children}
    </FluentLabel>
  )
);
Label.displayName = 'Label';

export { Label };
export type { LabelProps };
```

- [ ] **Step 2: Update label.tsx to re-export**

```tsx
export { Label } from './fluent-label';
export type { LabelProps } from './fluent-label';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/label.tsx src/components/ui/fluent-label.tsx
git commit -m "feat: migrate Label component to Fluent UI"
```

---

## Task 6: Migrate Sheet to Drawer

**Files:**
- Modify: `src/components/ui/sheet.tsx`
- Create: `src/components/ui/fluent-sheet.tsx`

**Interfaces:**
- Consumes: existing Sheet API (Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle)
- Produces: Fluent UI Drawer wrapper with same API

- [ ] **Step 1: Create Fluent UI Drawer wrapper**

Create `src/components/ui/fluent-sheet.tsx`:

```tsx
import React from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  type DrawerProps,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';

interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

interface SheetContentProps {
  side?: 'left' | 'right' | 'top' | 'bottom';
  className?: string;
  children: React.ReactNode;
}

interface SheetHeaderProps {
  className?: string;
  children: React.ReactNode;
}

interface SheetTitleProps {
  className?: string;
  children: React.ReactNode;
}

const SheetContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

const Sheet: React.FC<SheetProps> = ({ open, onOpenChange, children }) => (
  <SheetContext.Provider value={{ open: open ?? false, onOpenChange: onOpenChange ?? (() => {}) }}>
    {children}
  </SheetContext.Provider>
);

const SheetTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ onClick, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);
    return (
      <button
        ref={ref}
        onClick={(e) => {
          onClick?.(e);
          onOpenChange(true);
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SheetTrigger.displayName = 'SheetTrigger';

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = 'right', className, children }, ref) => {
    const { open, onOpenChange } = React.useContext(SheetContext);
    const position = side === 'left' ? 'start' : side === 'right' ? 'end' : side;

    return (
      <Drawer
        open={open}
        onOpenChange={(_, { open }) => onOpenChange(open)}
        position={position as 'start' | 'end' | 'bottom'}
        className={className}
      >
        {children}
      </Drawer>
    );
  }
);
SheetContent.displayName = 'SheetContent';

const SheetHeader = React.forwardRef<HTMLDivElement, SheetHeaderProps>(
  ({ className, children }, ref) => (
    <DrawerHeader ref={ref} className={className}>
      {children}
    </DrawerHeader>
  )
);
SheetHeader.displayName = 'SheetHeader';

const SheetTitle = React.forwardRef<HTMLDivElement, SheetTitleProps>(
  ({ className, children }, ref) => (
    <DrawerHeaderTitle ref={ref} className={className}>
      {children}
    </DrawerHeaderTitle>
  )
);
SheetTitle.displayName = 'SheetTitle';

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle };
```

- [ ] **Step 2: Update sheet.tsx to re-export**

```tsx
export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from './fluent-sheet';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/sheet.tsx src/components/ui/fluent-sheet.tsx
git commit -m "feat: migrate Sheet component to Fluent UI Drawer"
```

---

## Task 7: Migrate Dialog Component

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/fluent-dialog.tsx`

**Interfaces:**
- Consumes: existing Dialog API (Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter)
- Produces: Fluent UI Dialog wrapper

- [ ] **Step 1: Create Fluent UI Dialog wrapper**

Create `src/components/ui/fluent-dialog.tsx`:

```tsx
import React from 'react';
import {
  Dialog as FluentDialog,
  DialogTrigger as FluentDialogTrigger,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => (
  <FluentDialog open={open} onOpenChange={(_, { open }) => onOpenChange?.(open)}>
    <DialogContext.Provider value={{ open: open ?? false, onOpenChange: onOpenChange ?? (() => {}) }}>
      {children}
    </DialogContext.Provider>
  </FluentDialog>
);

const DialogTrigger = FluentDialogTrigger;

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <DialogSurface ref={ref} className={className} {...props}>
      {children}
    </DialogSurface>
  )
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <DialogBody ref={ref} className={className} {...props}>
      {children}
    </DialogBody>
  )
);
DialogHeader.displayName = 'DialogHeader';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <DialogTitle ref={ref} className={className} {...props}>
      {children}
    </DialogTitle>
  )
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => (
    <DialogContent ref={ref} className={className} {...props}>
      {children}
    </DialogContent>
  )
);
DialogDescription.displayName = 'DialogDescription';

const DialogFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <DialogActions ref={ref} className={className} {...props}>
      {children}
    </DialogActions>
  )
);
DialogFooter.displayName = 'DialogFooter';

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
```

- [ ] **Step 2: Update dialog.tsx to re-export**

```tsx
export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './fluent-dialog';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/fluent-dialog.tsx
git commit -m "feat: migrate Dialog component to Fluent UI"
```

---

## Task 8: Migrate DropdownMenu to Menu

**Files:**
- Modify: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/fluent-dropdown.tsx`

**Interfaces:**
- Consumes: existing DropdownMenu API
- Produces: Fluent UI Menu wrapper

- [ ] **Step 1: Create Fluent UI Menu wrapper**

Create `src/components/ui/fluent-dropdown.tsx`:

```tsx
import React from 'react';
import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  type MenuProps,
} from '@fluentui/react-components';

interface DropdownMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ open, onOpenChange, children }) => (
  <Menu open={open} onOpenChange={(_, data) => onOpenChange?.(data.open)}>
    {children}
  </Menu>
);

const DropdownMenuTrigger = MenuTrigger;
const DropdownMenuContent = ({ children, ...props }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
  <MenuPopover {...props}>
    <MenuList>{children}</MenuList>
  </MenuPopover>
);
const DropdownMenuItem = MenuItem;
const DropdownMenuSeparator = MenuDivider;
const DropdownMenuLabel = ({ children, ...props }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className="px-2 py-1.5 text-sm font-semibold" {...props}>{children}</div>
);

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
```

- [ ] **Step 2: Update dropdown-menu.tsx to re-export**

```tsx
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './fluent-dropdown';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/ui/fluent-dropdown.tsx
git commit -m "feat: migrate DropdownMenu component to Fluent UI Menu"
```

---

## Task 9: Migrate Tooltip Component

**Files:**
- Modify: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/fluent-tooltip.tsx`

**Interfaces:**
- Consumes: existing Tooltip API
- Produces: Fluent UI Tooltip wrapper

- [ ] **Step 1: Create Fluent UI Tooltip wrapper**

Create `src/components/ui/fluent-tooltip.tsx`:

```tsx
import React from 'react';
import { Tooltip as FluentTooltip } from '@fluentui/react-components';

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
}

const sideMap: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'above',
  bottom: 'below',
  left: 'before',
  right: 'after',
};

const Tooltip: React.FC<TooltipProps> = ({ children, content, side = 'top', delayDuration = 200 }) => (
  <FluentTooltip
    content={content}
    relationship="label"
    positioning={sideMap[side]}
    showDelay={delayDuration}
  >
    {children}
  </FluentTooltip>
);

export { Tooltip };
export type { TooltipProps };
```

- [ ] **Step 2: Update tooltip.tsx to re-export**

```tsx
export { Tooltip } from './fluent-tooltip';
export type { TooltipProps } from './fluent-tooltip';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/tooltip.tsx src/components/ui/fluent-tooltip.tsx
git commit -m "feat: migrate Tooltip component to Fluent UI"
```

---

## Task 10: Migrate Tabs Component

**Files:**
- Modify: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/fluent-tabs.tsx`

**Interfaces:**
- Consumes: existing Tabs API (Tabs, TabsList, TabsTrigger, TabsContent)
- Produces: Fluent UI TabList wrapper

- [ ] **Step 1: Create Fluent UI TabList wrapper**

Create `src/components/ui/fluent-tabs.tsx`:

```tsx
import React from 'react';
import {
  TabList,
  Tab,
  type TabListProps,
  type TabProps,
} from '@fluentui/react-components';

interface TabsProps {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  children: React.ReactNode;
  className?: string;
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({ value: '', onValueChange: () => {} });

const Tabs: React.FC<TabsProps> = ({ value, onValueChange, defaultValue, children, className }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
  const currentValue = value ?? internalValue;
  const handleChange = onValueChange ?? setInternalValue;

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children }, ref) => {
    const { value, onValueChange } = React.useContext(TabsContext);
    return (
      <TabList ref={ref} selectedValue={value} onTabSelect={(_, data) => onValueChange(data.value as string)} className={className}>
        {children}
      </TabList>
    );
  }
);
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, children, className, disabled }, ref) => (
    <Tab ref={ref} value={value} disabled={disabled} className={className}>
      {children}
    </Tab>
  )
);
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, children, className }, ref) => {
    const { value: selectedValue } = React.useContext(TabsContext);
    if (selectedValue !== value) return null;
    return (
      <div ref={ref} className={className} role="tabpanel">
        {children}
      </div>
    );
  }
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 2: Update tabs.tsx to re-export**

```tsx
export { Tabs, TabsList, TabsTrigger, TabsContent } from './fluent-tabs';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/tabs.tsx src/components/ui/fluent-tabs.tsx
git commit -m "feat: migrate Tabs component to Fluent UI"
```

---

## Task 11: Migrate Avatar Component

**Files:**
- Modify: `src/components/ui/avatar.tsx`
- Create: `src/components/ui/fluent-avatar.tsx`

**Interfaces:**
- Consumes: existing Avatar API (Avatar, AvatarFallback)
- Produces: Fluent UI Avatar wrapper

- [ ] **Step 1: Create Fluent UI Avatar wrapper**

Create `src/components/ui/fluent-avatar.tsx`:

```tsx
import React from 'react';
import { Avatar as FluentAvatar, type AvatarProps as FluentAvatarProps } from '@fluentui/react-components';

interface AvatarProps extends Omit<FluentAvatarProps, 'name'> {
  name?: string;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, name, children, ...props }, ref) => (
    <FluentAvatar ref={ref} name={name} className={className} {...props}>
      {children}
    </FluentAvatar>
  )
);
Avatar.displayName = 'Avatar';

const AvatarFallback = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={className} {...props}>
      {children}
    </span>
  )
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarFallback };
export type { AvatarProps };
```

- [ ] **Step 2: Update avatar.tsx to re-export**

```tsx
export { Avatar, AvatarFallback } from './fluent-avatar';
export type { AvatarProps } from './fluent-avatar';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/avatar.tsx src/components/ui/fluent-avatar.tsx
git commit -m "feat: migrate Avatar component to Fluent UI"
```

---

## Task 12: Migrate Textarea Component

**Files:**
- Modify: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/fluent-textarea.tsx`

**Interfaces:**
- Consumes: existing Textarea component API
- Produces: Fluent UI Textarea wrapper

- [ ] **Step 1: Create Fluent UI Textarea wrapper**

Create `src/components/ui/fluent-textarea.tsx`:

```tsx
import React from 'react';
import { Textarea as FluentTextarea, type TextareaProps as FluentTextareaProps } from '@fluentui/react-components';

interface TextareaProps extends FluentTextareaProps {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <FluentTextarea ref={ref} className={className} {...props} />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };
```

- [ ] **Step 2: Update textarea.tsx to re-export**

```tsx
export { Textarea } from './fluent-textarea';
export type { TextareaProps } from './fluent-textarea';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/textarea.tsx src/components/ui/fluent-textarea.tsx
git commit -m "feat: migrate Textarea component to Fluent UI"
```

---

## Task 13: Migrate Skeleton Component

**Files:**
- Modify: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/fluent-skeleton.tsx`

**Interfaces:**
- Consumes: existing Skeleton component API
- Produces: Fluent UI Skeleton wrapper

- [ ] **Step 1: Create Fluent UI Skeleton wrapper**

Create `src/components/ui/fluent-skeleton.tsx`:

```tsx
import React from 'react';
import { Skeleton, SkeletonItem, type SkeletonProps as FluentSkeletonProps } from '@fluentui/react-components';

interface SkeletonProps extends FluentSkeletonProps {
  className?: string;
}

const SkeletonComponent = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, children, ...props }, ref) => (
    <Skeleton ref={ref} className={className} {...props}>
      {children}
    </Skeleton>
  )
);
SkeletonComponent.displayName = 'Skeleton';

const SkeletonItem = SkeletonItem;

export { SkeletonComponent as Skeleton, SkeletonItem };
```

- [ ] **Step 2: Update skeleton.tsx to re-export**

```tsx
export { Skeleton, SkeletonItem } from './fluent-skeleton';
```

- [ ] **Step 3: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/skeleton.tsx src/components/ui/fluent-skeleton.tsx
git commit -m "feat: migrate Skeleton component to Fluent UI"
```

---

## Task 14: Update ConfirmDialog to Use Fluent Dialog

**Files:**
- Modify: `src/components/ui/confirm-dialog.tsx`

**Interfaces:**
- Consumes: migrated Dialog and Button components
- Produces: ConfirmDialog using Fluent UI Dialog

- [ ] **Step 1: Update confirm-dialog.tsx imports**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { Button } from './button';
```

- [ ] **Step 2: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx
git commit -m "feat: update ConfirmDialog to use Fluent UI Dialog"
```

---

## Task 15: Update DataTable to Use Fluent Table

**Files:**
- Modify: `src/components/ui/data-table.tsx`

**Interfaces:**
- Consumes: migrated Table component
- Produces: DataTable using Fluent UI Table

- [ ] **Step 1: Update data-table.tsx imports**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
```

- [ ] **Step 2: Run type check and tests**

```bash
npx tsc --noEmit && bun run test
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/data-table.tsx
git commit -m "feat: update DataTable to use Fluent UI Table"
```

---

## Task 16: Final Verification

**Files:**
- All migrated files

**Interfaces:**
- Consumes: all previous tasks
- Produces: fully migrated Fluent UI application

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run all tests**

```bash
bun run test
```

- [ ] **Step 3: Start dev server**

```bash
bun start
```

- [ ] **Step 4: Verify visual appearance**

Check that all components look identical to before migration.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Fluent UI migration"
```
