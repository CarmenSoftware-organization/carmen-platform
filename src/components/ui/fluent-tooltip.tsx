import React from 'react';
import { Tooltip as FluentTooltip } from '@fluentui/react-components';
import type { PositioningShorthandValue } from '@fluentui/react-positioning';

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
}

const sideMap: Record<NonNullable<TooltipProps['side']>, PositioningShorthandValue> = {
  top: 'above',
  bottom: 'below',
  left: 'before',
  right: 'after',
};

const Tooltip: React.FC<TooltipProps> = ({ children, content, side = 'top', delayDuration = 200 }) => (
  <FluentTooltip
    content={<>{content}</>}
    relationship="label"
    positioning={sideMap[side]}
    showDelay={delayDuration}
  >
    {children}
  </FluentTooltip>
);

const TooltipProvider: React.FC<{ children: React.ReactNode; delayDuration?: number }> = ({ children }) => <>{children}</>;
const TooltipTrigger: React.FC<{ children: React.ReactElement; asChild?: boolean }> = ({ children }) => children;
const TooltipContent: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent };
export type { TooltipProps };
