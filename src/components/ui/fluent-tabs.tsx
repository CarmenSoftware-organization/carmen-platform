import React from 'react';
import {
  TabList,
  Tab,
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
