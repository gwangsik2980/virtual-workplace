import { useState } from 'react';
import { CONCEPTS, type Concept } from '../../sim/learning';
import { formatDay, nextId } from '../../sim/util';
import { HeroFacts, ScreenHero, SectionHead } from '../components/Editorial';
import { Reveal } from '../motion';
import { useStore } from '../store';
import './learn.css';

type Filter = 'all' | 'new' | 'done';

export function Learning() {
  const { state, update, openCase } = useStore();
  const { unlocked, understood, notes } = state.learning;
  const unlockedCount = CONCEPTS.filter((c) => unlocked[c.id] !== undefined).length;
  const understoodCount = CONCEPTS.filter((c) => understood[c.id]).length;
  const nextLocked = CONCEPTS.find((c) => unlocked[c.id] === undefined);
  const [free, setFree] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // 열린 개념을 앞에, 같은 그룹 안에서는 원래 순서
  const ordered = CONCEPTS.map((c, i) => ({ c, no: i + 1 })).sort((a, b) => {
    const ua = unlocked[a.c.id] !== undefined ? 0 : 1;
    const ub = unlocked[b.c.id] !== undefined ? 0 : 1;
    return ua - ub || a.no - b.no;
  });
  const shown = ordered.filter(({ c }) => {
    if (filter === 'new') return unlocked[c.id] !== undefined && !understood[c.id];
    if (filter === 'done') return understood[c.id];
    return true;
  });

  const addNote = (text: string, extra: { conceptId?: string; caseId?: string } = {}) =>
    update((d) => {
      d.learning.notes.push({ id: nextId(d, 'NOTE'), day: d.day, text, ...extra });
    });

  const conceptTitle = (id?: string) => CONCEPTS.find((c) => c.id === id)?.title;

  const filters: [Filter, string, number][] = [
    ['all', '전체', CONCEPTS.length],
    ['new', '이해 전', unlockedCount - CONCEPTS.filter((c) => unlocked[c.id] !== undefined && understood[c.id]).length],
    ['done', '이해함', understoodCount],
  ];

  return (
    <>
      <ScreenHero
        eyebrow="08 — Learning"
        lines={['관찰하면', '개념이 열립니다']}
        watermark="LEARN"
        lead="가상 직원이 어떤 업무를 처음 하면 그 업무의 구매 개념 카드가 열립니다. 카드마다 있는 질문에 내 말로 답을 적어 보며 정리하세요."
        aside={
          <HeroFacts
            items={[
              { label: '관찰한 개념', value: `${unlockedCount} / ${CONCEPTS.length}`, note: `${Math.round((unlockedCount / CONCEPTS.length) * 100)}% 열림` },
              { label: '이해함', value: `${understoodCount}개`, note: unlockedCount ? `열린 개념 중 ${Math.round((understoodCount / unlockedCount) * 100)}%` : '아직 없음' },
              { label: '관찰 메모', value: `${notes.length}개`, note: '답변과 자유 메모' },
              { label: '다음에 열릴 개념', value: <span className="learn-next">{nextLocked ? nextLocked.title : '모두 열림'}</span>, note: nextLocked ? '시간을 진행하면 열려요' : '18개 전부 관찰' },
            ]}
          />
        }
      />

      <Reveal>
        <div className="notice notice-warn">
          개념 설명은 일반적인 구매 실무 지식을 바탕으로 정리했고, 공개 자료와 대조해 일부를 고쳤습니다. 다만 원문까지 확인하지 못한 출처가 있고
          실무자 검증은 거치지 않았으니 교재나 실무 자료와 대조해 보길 권합니다.{' '}
          <a href="https://github.com/gwangsik2980/virtual-workplace/blob/main/docs/practice-sources.md" target="_blank" rel="noreferrer">
            대조 결과와 출처 보기
          </a>
        </div>
      </Reveal>

      <SectionHead
        eyebrow="Concept cards"
        title="구매 개념 18장"
        actions={
          <div className="learn-filters" role="group" aria-label="개념 필터">
            {filters.map(([k, l, n]) => (
              <button key={k} className={`pill pill-sm ${filter === k ? 'pill-dark' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {l} <span className="learn-count">{n}</span>
              </button>
            ))}
          </div>
        }
      />

      <div className="learn-grid">
        {shown.map(({ c, no }, i) => (
          <Reveal key={c.id} delay={Math.min(i, 8) * 50} y={1.25}>
            <ConceptCard concept={c} no={no} onAnswer={(text) => addNote(text, { conceptId: c.id })} />
          </Reveal>
        ))}
        {shown.length === 0 && <div className="empty learn-empty">해당하는 개념이 없습니다.</div>}
      </div>

      <SectionHead eyebrow="Notes" title="관찰 메모" desc="관찰하면서 알게 된 점, 궁금한 점, 개선 아이디어를 남겨 두세요. 최신순으로 보입니다." />

      <Reveal>
        <div className="learn-compose">
          <textarea placeholder="예: 견적서마다 VAT 표기가 달라서 비교표 만들 때 헷갈림" value={free} onChange={(e) => setFree(e.target.value)} />
          <button
            className="pill pill-dark"
            disabled={!free.trim()}
            onClick={() => {
              addNote(free.trim());
              setFree('');
            }}
          >
            메모 추가
          </button>
        </div>
      </Reveal>

      {notes.length === 0 ? (
        <div className="empty">아직 메모가 없습니다.</div>
      ) : (
        <ul className="learn-notes">
          {[...notes].reverse().map((n) => (
            <li key={n.id} className="learn-note">
              <div className="learn-note-meta">
                <span className="num">{formatDay(state.startDate, n.day)}</span>
                {n.conceptId && <span className="badge">{conceptTitle(n.conceptId) ?? n.conceptId}</span>}
                {n.caseId && (
                  <button className="pill pill-sm" onClick={() => openCase(n.caseId!)}>
                    {n.caseId} 보기
                  </button>
                )}
              </div>
              <p className="learn-note-text">{n.text}</p>
              <button
                className="learn-note-del"
                aria-label="메모 삭제"
                onClick={() => {
                  if (confirm('이 메모를 삭제할까요?'))
                    update((d) => {
                      d.learning.notes = d.learning.notes.filter((x) => x.id !== n.id);
                    });
                }}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ConceptCard({ concept: c, no, onAnswer }: { concept: Concept; no: number; onAnswer: (text: string) => void }) {
  const { state, update } = useStore();
  const firstDay = state.learning.unlocked[c.id];
  const isUnlocked = firstDay !== undefined;
  const isUnderstood = !!state.learning.understood[c.id];
  const answers = state.learning.notes.filter((n) => n.conceptId === c.id);
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const idx = String(no).padStart(2, '0');

  if (!isUnlocked) {
    return (
      <article className="learn-card locked" aria-label={`${c.title}, 아직 관찰하지 못함`}>
        <div className="learn-card-top">
          <span className="learn-no">{idx}</span>
          <span className="learn-lock" aria-hidden>
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
        </div>
        <h3 className="learn-title">{c.title}</h3>
        <p className="learn-locked-text">아직 관찰하지 못한 업무예요. 시간을 진행하면 가상 직원이 이 업무를 하게 돼요.</p>
      </article>
    );
  }

  return (
    <article className={`learn-card ink ${isUnderstood ? 'done' : ''} ${open ? 'open' : ''}`}>
      <div className="learn-card-top">
        <span className="learn-no">{idx}</span>
        <button
          className={`learn-toggle ${isUnderstood ? 'on' : ''}`}
          aria-pressed={isUnderstood}
          onClick={() =>
            update((d) => {
              d.learning.understood[c.id] = !isUnderstood;
            })
          }
        >
          {isUnderstood ? '✓ 이해함' : '이해함 표시'}
        </button>
      </div>
      <h3 className="learn-title">{c.title}</h3>
      <p className="learn-summary">{c.summary}</p>
      <div className="learn-card-foot">
        <span>처음 관찰 {formatDay(state.startDate, firstDay)}</span>
        <button className="learn-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : answers.length ? `자세히 · 답변 ${answers.length}` : '자세히'}
        </button>
      </div>
      {open && (
        <div className="learn-detail">
          <dl className="learn-dl">
            <dt>왜 중요한가</dt>
            <dd>{c.why}</dd>
            <dt>시뮬레이션에서 보는 곳</dt>
            <dd>{c.observe}</dd>
            <dt>스스로 설명해 보기</dt>
            <dd className="learn-q">{c.check}</dd>
          </dl>
          <div className="learn-answer-col">
          {answers.length > 0 && (
            <ul className="learn-answers">
              {answers.map((a) => (
                <li key={a.id}>
                  {a.text}
                  <span>{formatDay(state.startDate, a.day)}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea placeholder="내 말로 답을 적어 보세요" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          <button
            className="pill pill-sm pill-dark"
            disabled={!answer.trim()}
            onClick={() => {
              onAnswer(answer.trim());
              setAnswer('');
            }}
          >
            답변 저장
          </button>
          </div>
        </div>
      )}
    </article>
  );
}
