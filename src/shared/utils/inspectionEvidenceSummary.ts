import type { RobotInspectionContext } from '@/types'

export interface InspectionEvidenceMetric {
  label: string
  value: string
}

export interface InspectionEvidenceSummary {
  title: string
  metrics: InspectionEvidenceMetric[]
}

export function buildInspectionEvidenceSummary(
  inspectionContext: RobotInspectionContext | undefined,
  lang: 'en' | 'zh'
): InspectionEvidenceSummary | null {
  if (!inspectionContext) {
    return null
  }

  const isZh = lang === 'zh'
  const metrics: InspectionEvidenceMetric[] = [
    {
      label: isZh ? '来源格式' : 'Source',
      value: inspectionContext.sourceFormat.toUpperCase()
    }
  ]

  if (inspectionContext.sourceFormat === 'mjcf' && inspectionContext.mjcf) {
    metrics.push(
      {
        label: isZh ? '含 site 的 body' : 'Bodies with Sites',
        value: String(inspectionContext.mjcf.bodiesWithSites.length)
      },
      {
        label: isZh ? 'site 数' : 'Sites',
        value: String(inspectionContext.mjcf.siteCount)
      },
      {
        label: isZh ? 'tendon 数' : 'Tendons',
        value: String(inspectionContext.mjcf.tendonCount)
      },
      {
        label: isZh ? '腱驱动器' : 'Tendon Actuators',
        value: String(inspectionContext.mjcf.tendonActuatorCount)
      }
    )
  }

  return {
    title: isZh ? '源格式证据' : 'Source Evidence',
    metrics
  }
}
