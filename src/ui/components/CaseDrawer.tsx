export function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">{caseId}</div>
      </aside>
    </>
  );
}
