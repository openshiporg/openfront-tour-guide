/**
 * Sidebar component - Navigation for Dashboard 2
 * Based on Dashboard 1 sidebar with consistent ShadCN styling and models dropdown
 */

'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  Sidebar as SidebarComponent, 
  SidebarContent, 
  SidebarHeader, 
  SidebarFooter,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AdminMeta } from '../hooks/useAdminMeta'
import { Home, Database, ChevronRight, Package } from 'lucide-react'
import { Logo, LogoIcon } from '@/features/dashboard/components/Logo'
import { UserProfileClient } from './UserProfileClient'
import { useDashboard } from '../context/DashboardProvider'
import { visiblePlatformItems, visibleSidebarLists } from '../lib/sidebarAccess'
import { OnboardingCards } from '@/features/platform/onboarding/components/OnboardingCards'
import { dismissOnboarding } from '@/features/platform/onboarding/actions/onboarding'
import { platformNavGroups, platformStandaloneItems, getPlatformNavItemsWithBasePath } from '@/features/platform/lib/navigation'

interface User {
  id: string;
  operatorName?: string | null | undefined;
  onboardingStatus?: string;
  menuItemsCount?: number | null;
  email: string;
  name?: string;
  role?: {
    canAccessDashboard?: boolean;
    canManageOnboarding?: boolean;
  };
}

interface SidebarProps {
  adminMeta: AdminMeta | null
  user?: User | null
  onOpenDialog?: () => void
}

export function Sidebar({ adminMeta, user, onOpenDialog }: SidebarProps) {
  const { basePath } = useDashboard()
  const { isMobile, setOpenMobile } = useSidebar()
  const pathname = usePathname()

  const lists = adminMeta?.lists || {}
  const listsArray = Object.values(lists)

  // Function to check if a link is active
  const isLinkActive = React.useCallback(
    (href: string) => {
      if (!pathname) return false

      // Exact match for dashboard root
      if (href === '/dashboard' && pathname === '/dashboard') {
        return true
      }

      // For other pages, check if the pathname starts with the href
      if (href !== '/dashboard') {
        return pathname.startsWith(href)
      }

      return false
    },
    [pathname]
  )

  // Convert lists to sidebar links format
  const sidebarLinks = visibleSidebarLists(listsArray as any[], user).map((list: any) => ({
    title: list.label,
    href: `/dashboard/${list.path}`
  }))

  const platformWithBase = visiblePlatformItems(getPlatformNavItemsWithBasePath(basePath), listsArray as any[], user)
  const platformGroups = platformNavGroups.map((group) => ({
    title: group.title,
    items: platformWithBase.filter((item) => item.group === group.id).map((item) => ({ title: item.title, href: item.href })),
    isActive: platformWithBase.filter((item) => item.group === group.id).some((item) => isLinkActive(item.href)),
    icon: group.icon,
  })).filter((group) => group.items.length > 0)
  const standalone = visiblePlatformItems(platformStandaloneItems, listsArray as any[], user).map((item) => ({ ...item, href: `${basePath}${item.href}` }))

  // Dashboard items for the collapsible menu
  const dashboardItems = [
    ...platformGroups,
    {
      title: "Models",
      items: sidebarLinks,
      isActive: false,
      icon: Package,
    },
  ].filter((group) => group.items.length > 0)

  return (
    <SidebarComponent collapsible="icon">
      <SidebarHeader>
        <SidebarMenuButton asChild>
          <div className="group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden p-2">
            <Logo name={user?.operatorName ?? undefined} />
          </div>
        </SidebarMenuButton>
        <SidebarMenuButton asChild>
          <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
            <LogoIcon />
          </div>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className="no-scrollbar">
        {/* Dashboard Home Link */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isLinkActive('/dashboard')}>
                <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                  <Home className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {standalone.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isLinkActive(item.href)}>
                  <Link href={item.href} onClick={() => setOpenMobile(false)}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* Models Dropdown - Collapsible */}
        {dashboardItems.map((dashboardItem) => (
        <SidebarGroup key={dashboardItem.title}>
          <SidebarMenu>
            <SidebarGroupLabel>{dashboardItem.title}</SidebarGroupLabel>
            <div className="max-h-full overflow-y-auto group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden">
              <Collapsible
                key={dashboardItem.title}
                asChild
                defaultOpen={dashboardItem.isActive}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <dashboardItem.icon className="h-4 w-4" />
                      <span>{dashboardItem.title}</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {dashboardItem.items.map((link) => {
                        const handleClick = (e: React.MouseEvent) => {
                          setOpenMobile(false)
                        }

                        return (
                          <SidebarMenuSubItem key={link.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isLinkActive(link.href)}
                            >
                              <Link href={link.href} onClick={handleClick}>
                                <span>{link.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </div>

            {/* Models Dropdown - Icon Mode */}
            <div className="hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block">
              <DropdownMenu>
                <SidebarMenuItem>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                      <dashboardItem.icon className="h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                    className="min-w-56"
                  >
                    <div className="max-h-[calc(100vh-16rem)] overflow-y-auto py-1">
                      {dashboardItem.items.map((link) => {
                        const handleClick = (e: React.MouseEvent) => {
                          setOpenMobile(false)
                        }

                        return (
                          <DropdownMenuItem
                            asChild
                            key={link.href}
                            className={
                              isLinkActive(link.href)
                                ? "bg-blue-50 text-blue-600"
                                : ""
                            }
                          >
                            <Link href={link.href} onClick={handleClick}>
                              <span>{link.title}</span>
                              {isLinkActive(link.href) && (
                                <div className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
                              )}
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </div>
                  </DropdownMenuContent>
                </SidebarMenuItem>
              </DropdownMenu>
            </div>
           </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      
      <SidebarFooter>
        <div className="mb-2 w-full overflow-visible">
          <OnboardingCards
            steps={[{ href: '#onboarding', title: 'Set up your tours', description: 'Create tours, guides, fleet, departures and bookings in one step.' }]}
            onboardingStatus={user?.onboardingStatus}
            menuItemsCount={user?.menuItemsCount}
            userRole={user?.role}
            onDismiss={async () => { await dismissOnboarding() }}
            onOpenDialog={onOpenDialog}
          />
        </div>
        {user && <UserProfileClient user={user} />}
      </SidebarFooter>
      
      <SidebarRail />
    </SidebarComponent>
  )
}