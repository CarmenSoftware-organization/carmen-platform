import React from 'react';
import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
} from '@fluentui/react-components';
import { cn } from '../../lib/utils';

interface DropdownMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactElement | [React.ReactElement, React.ReactElement];
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ open, onOpenChange, children }) => (
  <Menu open={open} onOpenChange={(_, data) => onOpenChange?.(data.open)}>
    {children}
  </Menu>
);

interface DropdownMenuTriggerProps extends React.ComponentProps<typeof MenuTrigger> {
  asChild?: boolean;
}

const DropdownMenuTrigger: React.FC<DropdownMenuTriggerProps> = ({ asChild: _asChild, ...props }) => (
  <MenuTrigger {...props} />
);

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, align, sideOffset: _sideOffset, ...props }, ref) => (
    <MenuPopover ref={ref} className={cn('min-w-[8rem]', className)} {...props}>
      <MenuList>{children}</MenuList>
    </MenuPopover>
  )
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {
  inset?: boolean;
}

const DropdownMenuItem = React.forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, inset: _inset, children, ...props }, ref) => (
    <MenuItem ref={ref} className={cn(className)} {...props}>
      {children}
    </MenuItem>
  )
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <MenuDivider ref={ref} className={cn('my-1', className)} {...props} />
  )
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props}>
      {children}
    </div>
  )
);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs tracking-widest opacity-60', className)} {...props} />
);
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
};
