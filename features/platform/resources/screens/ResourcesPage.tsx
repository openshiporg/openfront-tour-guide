import { listScreen } from '@/features/platform/components/ListScreen'
import { getResourcePlanner } from '../actions/resources'
import { ResourcePlanner } from '../components/ResourcePlanner'

const ResourceList = listScreen('resources')

// The resource pools list (add/edit vans, boats, kayaks) with the conflict-checked departure assignment planner under it.
export async function ResourcesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { resources, departures } = await getResourcePlanner()
  return (
    <>
      <ResourceList {...props} />
      <div className="border-t"><ResourcePlanner resources={resources} departures={departures} /></div>
    </>
  )
}
export default ResourcesPage
