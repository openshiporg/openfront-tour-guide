import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { getAdminMetaAction } from '@/features/dashboard/actions/getAdminMetaAction'
import { PLATFORM_PAGE_LIST } from './sidebarAccess'

/** 404s a platform page when its backing list is hidden for the session (same mapping as the sidebar). */
export function gatePlatformPage<P extends object>(slug: string, Page: ComponentType<P>) {
  return async function GatedPlatformPage(props: P) {
    const response = await getAdminMetaAction()
    const lists: { path: string; isHidden?: boolean | null }[] = response.success ? response.data?.lists ?? [] : []
    const hidden = new Set(lists.filter((l) => l.isHidden).map((l) => l.path))
    if (hidden.has(slug) || hidden.has(PLATFORM_PAGE_LIST[slug] ?? slug)) notFound()
    return <Page {...props} />
  }
}
