/** 알림으로 보내는 사건 종류. 화면 알림과 닫아 둔 동안 보내는 푸시가 같은 기준을 쓴다 */
import type { EventLog } from './types';

export type AlertKind = 'stockout' | 'urgent' | 'delay' | 'quality' | 'finance' | 'risk' | 'payroll';

export const ALERT_LABELS: Record<AlertKind, string> = {
  stockout: '결품',
  urgent: '긴급 요청',
  delay: '납기 지연',
  quality: '품질',
  finance: '정산 불일치',
  risk: '납기 위험 알림',
  payroll: '급여 입금',
};

export function alertKind(e: EventLog): AlertKind | null {
  if (e.type === 'stockout') return 'stockout';
  if (e.type === 'request' && e.title.startsWith('[긴급]')) return 'urgent';
  if (e.type === 'delay' && !/만회|독촉 결과/.test(e.title)) return 'delay';
  if (e.type === 'quality') return 'quality';
  if (e.type === 'finance' && e.title.startsWith('정산 불일치')) return 'finance';
  if (e.type === 'tool' && e.title.startsWith('납기 위험 알림')) return 'risk';
  if (e.type === 'payroll') return 'payroll';
  return null;
}
