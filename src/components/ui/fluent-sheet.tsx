import React from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerFooter,
  type DrawerProps,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { cn } from '../../lib/utils';

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

interface SheetDescriptionProps {
  className?: string;
  children: React.ReactNode;
}

interface SheetFooterProps {
  className?: string;
  children: React.ReactNode;
}

interface SheetCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

interface SheetTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

interface SheetPortalProps {
  children: React.ReactNode;
}

interface SheetOverlayProps {
  className?: string;
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

const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ onClick, children, asChild, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          const childOnClick = (children.props as React.HTMLAttributes<HTMLElement>).onClick;
          if (childOnClick) childOnClick(e as React.MouseEvent<HTMLElement>);
          onOpenChange(true);
        },
      });
    }

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

const sideToPosition: Record<string, 'start' | 'end' | 'bottom'> = {
  left: 'end',
  right: 'start',
  top: 'start',
  bottom: 'bottom',
};

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = 'right', className, children }, ref) => {
    const { open, onOpenChange } = React.useContext(SheetContext);

    return (
      <Drawer
        open={open}
        onOpenChange={(_, { open: isOpen }) => onOpenChange(isOpen)}
        position={sideToPosition[side] ?? 'start'}
        ref={ref}
      >
        <DrawerBody className={cn('overflow-y-auto', className)}>
          {children}
        </DrawerBody>
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

const SheetDescription = React.forwardRef<HTMLDivElement, SheetDescriptionProps>(
  ({ className, children }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </p>
  )
);
SheetDescription.displayName = 'SheetDescription';

const SheetFooter = React.forwardRef<HTMLDivElement, SheetFooterProps>(
  ({ className, children }, ref) => (
    <DrawerFooter ref={ref} className={className}>
      {children}
    </DrawerFooter>
  )
);
SheetFooter.displayName = 'SheetFooter';

const SheetClose = React.forwardRef<HTMLButtonElement, SheetCloseProps>(
  ({ onClick, asChild, children, className, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          const childOnClick = (children.props as React.HTMLAttributes<HTMLElement>).onClick;
          if (childOnClick) childOnClick(e as React.MouseEvent<HTMLElement>);
          onOpenChange(false);
        },
      });
    }

    return (
      <button
        ref={ref}
        onClick={(e) => {
          onClick?.(e);
          onOpenChange(false);
        }}
        className={cn(
          'inline-flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none',
          className
        )}
        {...props}
      >
        {children ?? <DismissRegular />}
        <span className="sr-only">Close</span>
      </button>
    );
  }
);
SheetClose.displayName = 'SheetClose';

const SheetPortal: React.FC<SheetPortalProps> = ({ children }) => <>{children}</>;
SheetPortal.displayName = 'SheetPortal';

const SheetOverlay = React.forwardRef<HTMLDivElement, SheetOverlayProps>(
  ({ className: _className }, ref) => <div ref={ref} className="hidden" />
);
SheetOverlay.displayName = 'SheetOverlay';

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
  SheetPortal,
  SheetOverlay,
};
