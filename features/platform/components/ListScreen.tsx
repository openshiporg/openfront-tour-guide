import { ListPage } from '@/features/dashboard/screens/ListPage'

// Generic list view for catalog lists that need no bespoke workflow.
export function listScreen(listKey: string) {
  return async function Screen(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    return <ListPage params={Promise.resolve({ listKey })} searchParams={props.searchParams} />
  }
}
