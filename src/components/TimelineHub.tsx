/**
 * ============ 日历 · 时间轴 统一入口 ============
 * 「时间轴 / 日历排期」双 Tab 宿主：
 *  · 由 ModalHost 的 modal==='hub' 打开
 *  · 子页懒加载（默认时间轴，切到日历时才加载日历组件）
 *  · hubFocus：从画布跳转时的聚焦参数（日期/卡片）
 */
import { lazy, Suspense, useState } from 'react';
import { useStudio } from '../store';
import { ClockIcon, CalendarColorIcon, CloseIcon } from './icons';
// 子页懒加载：默认只加载时间轴；日历在用户切到「日历排期」时才加载
const CalendarBoard = lazy(() => import('./CalendarBoard'));
const StoryTimeline = lazy(() => import('./StoryTimeline'));

export default function TimelineHub({ onClose }: { onClose: () => void }) {
  const hubFocus = useStudio((s) => s.hubFocus);
  const [tab, setTab] = useState<'timeline' | 'calendar'>(hubFocus?.date ? 'calendar' : 'timeline');
  return (
    <div className="hub-root">
      <div className="hub-top">
        <span className="hub-title">{tab === 'timeline' ? <><ClockIcon size={15} /> 时间轴</> : <><CalendarColorIcon size={15} /> 日历排期</>}</span>
        <div className="hub-tabs">
          <button className={tab === 'timeline' ? 'on' : ''} onClick={() => setTab('timeline')}><ClockIcon size={14} /> 时间轴</button>
          <button className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}><CalendarColorIcon size={14} /> 日历排期</button>
        </div>
        <button className="btn small ghost hub-close" onClick={onClose}><CloseIcon size={13} /> 关闭</button>
      </div>
      <div className="hub-body">
        {tab === 'timeline'
          ? <Suspense fallback={null}><StoryTimeline onClose={onClose} embedded onGoCalendar={() => setTab('calendar')} focusCardId={hubFocus?.cardId} /></Suspense>
          : <Suspense fallback={null}><CalendarBoard onClose={onClose} embedded focusDate={hubFocus?.date} /></Suspense>}
      </div>
    </div>
  );
}