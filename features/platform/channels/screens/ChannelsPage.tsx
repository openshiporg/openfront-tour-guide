import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getSettlements } from '../actions/settlement'
import { GenerateStatement, SettlementRows } from '../components/SettlementActions'

export async function ChannelsPage() {
  const data = await getSettlements()
  return <PageContainer title="Channels" breadcrumbs={[{type:'link',label:'Dashboard',href:'/dashboard'},{type:'page',label:'Channels'}]}>
    <GenerateStatement channels={data.channels} />
    <SettlementRows kind="statement" rows={data.channelStatements} />
  </PageContainer>
}
export default ChannelsPage
