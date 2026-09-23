'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva('inline-flex items-center text-muted-foreground', {
  variants: {
    variant: {
      /** Template default (shadcn-admin / fintech): inset segmented control. */
      segmented: 'h-9 justify-center gap-1 rounded-lg bg-muted p-1',
      /** Underline tabs for in-card section switches. */
      line: 'h-9 justify-start gap-4 border-b border-border bg-transparent p-0',
      /** Outlined pills for filter strips. */
      pills: 'h-auto flex-wrap justify-start gap-2 bg-transparent p-0',
    },
  },
  defaultVariants: { variant: 'segmented' },
});

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        segmented:
          'rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        line: 'h-9 rounded-none border-b-2 border-transparent px-1 pb-3 pt-2 text-muted-foreground hover:text-foreground data-[state=active]:border-secondary data-[state=active]:text-foreground',
        pills:
          'rounded-full border border-border bg-background px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[state=active]:border-transparent data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground',
      },
    },
    defaultVariants: { variant: 'segmented' },
  },
);

type TabsVariant = VariantProps<typeof tabsListVariants>['variant'];

const TabsVariantContext = React.createContext<TabsVariant>('segmented');

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = 'segmented', ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List ref={ref} className={cn(tabsListVariants({ variant }), className)} {...props} />
  </TabsVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & { variant?: TabsVariant }
>(({ className, variant, ...props }, ref) => {
  const inherited = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant: variant ?? inherited }), className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants };

