import { useState } from 'react';
import { CONCEPTS, type Concept } from '../../sim/learning';
import { formatDay, nextId } from '../../sim/util';
import { Card, PageHead, Progress } from '../components/Common';
import { useStore } from '../store';
import './lab.css';

export function Learning() {
  const { state, update, openCase } = useStore();
  const { unlocked, understood, notes } = state.learning;
  const unlockedCount = CONCEPTS.filter((c) => unlocked[c.id] !== undefined).length;
  const understoodCount = CONCEPTS.filter((c) => understood[c.id]).length;
  const [free, setFree] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'done'>('all');

  const sorted = [...CONCEPTS].sort((a, b) => {
    const ua = unlocked[a.id] !== undefined ? 0 : 1;
    const ub = unlocked[b.id] !== undefined ? 0 : 1;
    return ua - ub;
  });
  const shown = sorted.filter((c) => {
    if (filter === 'new') return unlocked[c.id] !== undefined && !understood[c.id];
    if (filter === 'done') return understood[c.id];
    return true;
  });

  const addNote = (text: string, extra: { conceptId?: string; caseId?: string } = {}) =>
    update((d) => {
      d.learning.notes.push({ id: nextId(d, 'NOTE'), day: d.day, text, ...extra });
    });

  const conceptTitle = (id?: string) => CONCEPTS.find((c) => c.id === id)?.title;

  return (
    <>
      <PageHead title="학습 노트" desc="가상 직원이 어떤 업무를 처음 하면 그 업무의 개념이 열립니다. 관찰한 내용을 내 말로 설명해 보며 정리하세요." />
      <div className="grid grid-3">
        <div className="card stat">
          <span className="stat-label">관찰한 개념</span>
          <span className="stat-value">
            {unlockedCount} / {CONCEPTS.length}
          </span>
          <Progress value={unlockedCount / CONCEPTS.length} />
        </div>
        <div className="card stat">
          <span className="stat-label">이해함으로 표시</span>
          <span className="stat-value">
            {understoodCount} / {unlockedCount}
          </span>
          <Progress value={unlockedCount ? understoodCount / unlockedCount : 0} color="var(--ok)" />
        </div>
        <div className="card stat">
          <span className="stat-label">관찰 메모</span>
          <span className="stat-value">{notes.length}개</span>
          <span className="stat-note">개념 답변과 자유 메모를 합친 수</span>
        </div>
      </div>
      <div className="notice notice-warn">
        개념 설명은 일반적인 구매 실무 지식을 바탕으로 정리했고, 공개 자료와 대조해 일부를 고쳤습니다. 다만 원문까지 확인하지 못한 출처가 있고
        실무자 검증은 거치지 않았으니 교재나 실무 자료와 대조해 보길 권합니다.{' '}
        <a href="https://github.com/gwangsik2980/virtual-workplace/blob/main/docs/practice-sources.md" target="_blank" rel="noreferrer">
          대조 결과와 출처 보기
        </a>
      </div>

      <div className="row">
        {(
          [
            ['all', '전체'],
            ['new', '아직 이해 전'],
            ['done', '이해함'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? 'btn-primary' : ''}`} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="concept-grid">
        {shown.map((c) => (
          <ConceptCard key={c.id} concept={c} onAnswer={(text) => addNote(text, { conceptId: c.id })} />
        ))}
        {shown.length === 0 && <div className="empty">해당하는 개념이 없습니다.</div>}
      </div>

      <Card title="관찰 메모" sub="최신순">
        <div className="stack" style={{ marginBottom: 12 }}>
          <textarea placeholder="관찰하면서 알게 된 점, 궁금한 점, 개선 아이디어를 적어 두세요." value={free} onChange={(e) => setFree(e.target.value)} />
          <div>
            <button
              className="btn btn-primary"
              disabled={!free.trim()}
              onClick={() => {
                addNote(free.trim());
                setFree('');
              }}
            >
              메모 추가
            </button>
          </div>
        </div>
        {notes.length === 0 ? (
          <div className="empty">아직 메모가 없습니다.</div>
        ) : (
          <div className="list">
            {[...notes].reverse().map((n) => (
              <div key={n.id} className="list-item">
                <div className="row between">
                  <div className="row">
                    <span className="faint">{formatDay(state.startDate, n.day)}</span>
                    {n.conceptId && <span className="badge badge-accent">{conceptTitle(n.conceptId) ?? n.conceptId}</span>}
                    {n.caseId && (
                      <button className="btn btn-sm" onClick={() => openCase(n.caseId!)}>
                        {n.caseId} 보기
                      </button>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      if (confirm('이 메모를 삭제할까요?'))
                        update((d) => {
                          d.learning.notes = d.learning.notes.filter((x) => x.id !== n.id);
                        });
                    }}
                  >
                    삭제
                  </button>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function ConceptCard({ concept: c, onAnswer }: { concept: Concept; onAnswer: (text: string) => void }) {
  const { state, update } = useStore();
  const firstDay = state.learning.unlocked[c.id];
  const isUnlocked = firstDay !== undefined;
  const isUnderstood = !!state.learning.understood[c.id];
  const answers = state.learning.notes.filter((n) => n.conceptId === c.id);
  const [answer, setAnswer] = useState('');

  if (!isUnlocked) {
    return (
      <div className="card concept-card locked">
        <h3>{c.title}</h3>
        <div className="faint" style={{ marginTop: 4 }}>
          아직 관찰하지 못한 업무입니다. 시간을 진행하면 가상 직원이 이 업무를 하게 됩니다.
        </div>
      </div>
    );
  }

  return (
    <div className="card concept-card">
      <div className="row between">
        <h3>{c.title}</h3>
        <label className="row" style={{ gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isUnderstood}
            onChange={(e) =>
              update((d) => {
                d.learning.understood[c.id] = e.target.checked;
              })
            }
          />
          이해함
        </label>
      </div>
      <div className="faint">처음 관찰: {formatDay(state.startDate, firstDay)}</div>
      <p style={{ marginBottom: 0 }}>{c.summary}</p>
      <dl>
        <dt>왜 중요한가</dt>
        <dd>{c.why}</dd>
        <dt>시뮬레이션에서 보는 곳</dt>
        <dd>{c.observe}</dd>
        <dt>스스로 설명해 보기</dt>
        <dd>{c.check}</dd>
      </dl>
      {answers.length > 0 && (
        <div className="stack" style={{ marginTop: 8, gap: 6 }}>
          {answers.map((a) => (
            <div key={a.id} className="doc" style={{ fontFamily: 'var(--font)', fontSize: 13 }}>
              {a.text}
              <div className="faint">{formatDay(state.startDate, a.day)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="stack" style={{ marginTop: 8 }}>
        <textarea placeholder="내 말로 답을 적어 보세요" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 56 }} />
        <div>
          <button
            className="btn btn-sm"
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
    </div>
  );
}
