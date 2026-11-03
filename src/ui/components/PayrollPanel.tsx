import { useState } from 'react';
import { estimateMonthly, nextPayday, PAYDAY_EXTRA, PAYDAY_SALARY, salaryRecord } from '../../sim/payroll';
import type { Payslip } from '../../sim/types';
import { dayToDate, formatDay } from '../../sim/util';
import { Reveal } from '../motion';
import { useStore } from '../store';
import { RowList, SectionHead } from './Editorial';
import './payroll.css';

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const man = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만원`;
const monthOf = (period: string) => `${Number(period.split('-')[1])}월분`;

/** 담당자 급여와 통장: 10일 월급, 25일 연장근로수당·성과급 */
export function PayrollPanel() {
  const { state } = useStore();
  const e = state.employee;
  const { account, payslips } = state.payroll;
  const [selected, setSelected] = useState<string | null>(null);
  const slip = payslips.find((p) => p.id === selected) ?? payslips[payslips.length - 1];
  const est = estimateMonthly(salaryRecord(state, dayToDate(state.startDate, Math.max(1, state.day - 1))).annual);

  const next = nextPayday(state);
  const nextDate = dayToDate(state.startDate, next.day);
  const prevMonth = nextDate.getMonth() === 0 ? 12 : nextDate.getMonth();
  const daysLeft = next.day - (state.day - 1);
  const nextLabel = next.kind === 'salary' ? `${prevMonth}월분 급여` : `${prevMonth}월분 연장근로수당·성과급`;
  const txns = [...account.txns].reverse().slice(0, 8);
  const sumOf = (labels: string[]) =>
    payslips.reduce((a, p) => a + p.deductions.filter((l) => labels.includes(l.label)).reduce((x, l) => x + l.amount, 0), 0);
  const totals = {
    gross: payslips.reduce((a, p) => a + p.gross, 0),
    tax: sumOf(['소득세', '지방소득세']),
    insurance: sumOf(['국민연금', '건강보험', '장기요양보험', '고용보험']),
  };

  return (
    <>
      <SectionHead
        eyebrow="Payroll"
        title="급여와 통장"
        desc={`매달 ${PAYDAY_SALARY}일에 전월 급여, ${PAYDAY_EXTRA}일에 전월 연장근로수당과 성과급이 들어옵니다. 지급일이 주말이나 공휴일이면 그 전 영업일에 줍니다.`}
      />
      <div className="pay-grid">
        <Reveal y={1.5}>
          <section className="ink pay-bank">
            <div className="pay-bank-top">
              <span className="pay-bank-name">{account.bank}</span>
              <span className="pay-bank-no">{account.number}</span>
            </div>
            <span className="pay-bank-owner">예금주 {e.name}</span>
            <div className="pay-balance">
              <span className="faint">잔액</span>
              <b>{won(account.balance)}</b>
            </div>
            {payslips.length > 0 && (
              <dl className="pay-totals">
                <div>
                  <dt>받은 세전 금액</dt>
                  <dd>{won(totals.gross)}</dd>
                </div>
                <div>
                  <dt>떼인 세금</dt>
                  <dd>{won(totals.tax)}</dd>
                </div>
                <div>
                  <dt>떼인 4대보험</dt>
                  <dd>{won(totals.insurance)}</dd>
                </div>
              </dl>
            )}
            <dl className="pay-bank-facts">
              <div>
                <dt>다음 입금</dt>
                <dd>
                  {formatDay(state.startDate, next.day)}
                  <small>{daysLeft <= 1 ? '오늘' : `${daysLeft}영업일 뒤`}</small>
                </dd>
                <dd className="faint">{nextLabel}</dd>
              </div>
              <div>
                <dt>연봉 ({e.rank})</dt>
                <dd>{man(est.annual)}</dd>
                <dd className="faint">월 실수령 약 {man(est.net)}</dd>
              </div>
            </dl>
          </section>
        </Reveal>
        <Reveal y={1.5} delay={80}>
          {slip ? <SlipView slip={slip} /> : <EmptySlip est={est} />}
        </Reveal>
      </div>
      {txns.length > 0 && (
        <>
          <h3 className="desk-subhead">통장 거래 내역</h3>
          <div className="desk-rows">
            <RowList
              items={txns.map((t) => ({
                key: `${t.day}-${t.payslipId}`,
                index: formatDay(state.startDate, t.day).slice(5, 10).replace('-', '/'),
                title: <span className="desk-row-title desk-row-title-sm">{t.memo}</span>,
                desc: `입금 후 잔액 ${won(t.balance)}`,
                meta: <span className="pay-in">+{won(t.amount)}</span>,
                onClick: t.payslipId ? () => setSelected(t.payslipId!) : undefined,
              }))}
            />
          </div>
        </>
      )}
    </>
  );
}

function SlipView({ slip }: { slip: Payslip }) {
  const { state } = useStore();
  return (
    <section className="pay-slip">
      <header className="pay-slip-head">
        <span className="eyebrow">급여명세서</span>
        <h4>
          {slip.period.slice(0, 4)}년 {monthOf(slip.period)} {slip.kind === 'salary' ? '급여' : '수당'}
        </h4>
        <span className="faint">
          지급일 {formatDay(state.startDate, slip.day)} · {slip.rank}
        </span>
      </header>
      <div className="pay-cols">
        <div>
          <h5>지급</h5>
          <ul>
            {slip.earnings.map((l) => (
              <li key={l.label}>
                <span>
                  {l.label}
                  {l.taxable === false && <small> 비과세</small>}
                </span>
                <b>{won(l.amount)}</b>
              </li>
            ))}
          </ul>
          <p className="pay-sum">
            <span>지급 합계</span>
            <b>{won(slip.gross)}</b>
          </p>
        </div>
        <div>
          <h5>공제</h5>
          <ul>
            {slip.deductions.map((l) => (
              <li key={l.label}>
                <span>{l.label}</span>
                <b>{won(l.amount)}</b>
              </li>
            ))}
          </ul>
          <p className="pay-sum">
            <span>공제 합계</span>
            <b>{won(slip.totalDeduction)}</b>
          </p>
        </div>
      </div>
      <p className="pay-net">
        <span>실수령액</span>
        <b>{won(slip.net)}</b>
      </p>
      {slip.note && <p className="pay-note faint">{slip.note}</p>}
    </section>
  );
}

function EmptySlip({ est }: { est: ReturnType<typeof estimateMonthly> }) {
  const { state } = useStore();
  const joined = dayToDate(state.startDate, state.employee.joinedDay);
  return (
    <section className="pay-slip pay-slip-empty">
      <span className="eyebrow">급여명세서</span>
      <h4>아직 받은 급여가 없습니다</h4>
      <p className="faint">
        {joined.getMonth() + 1}월 {joined.getDate()}일에 입사해서 {joined.getMonth() + 1}월분 급여는 다음 달 {PAYDAY_SALARY}일에 일할 계산으로 들어옵니다.
        한 달을 다 채운 달의 예상 명세는 지급 {won(est.gross)}, 공제 {won(est.deduction)}, 실수령 {won(est.net)}입니다.
      </p>
    </section>
  );
}
