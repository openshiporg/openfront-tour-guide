import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { getOperatorSettings } from '../actions/settings'
import { SettingsForm } from '../components/SettingsForm'

export async function SettingsPage() {
  const settings = await getOperatorSettings()
  return (
    <PageContainer title="Settings" breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Settings' }]}>
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">Operator details, the tax added at checkout, and the refund amount that needs another manager&apos;s approval.</p>
        {settings ? <SettingsForm settings={settings} /> : <p className="text-sm text-muted-foreground">No operator settings are available to your role.</p>}
      </div>
    </PageContainer>
  )
}
export default SettingsPage
