import { useEffect, useRef, useState } from 'react';
import './SprintCalendar.css';

function SprintCalendar({ dates, completedDates, selectedDate, playerName, disabled, language, onSelect }) {
  const picker = useRef(null);
  const [month, setMonth] = useState(() => selectedDate.slice(0, 7));
  const completed = new Set(completedDates);
  const available = new Set(dates);
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const monthIndex = months.indexOf(month);
  const locale = language === 'lt' ? 'lt-LT' : 'en-GB';
  const label = language === 'lt' ? 'Turnyro data' : 'Tournament date';
  const doneLabel = language === 'lt' ? 'Baigta' : 'Completed';
  const weekdays = language === 'lt' ? ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Math.ceil((offset + dayCount) / 7) * 7;
  const monthLabel = (value) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' });

  useEffect(() => {
    function closeOutside(event) {
      if (picker.current && !picker.current.contains(event.target)) picker.current.open = false;
    }
    function escape(event) {
      if (event.key === 'Escape' && picker.current?.open) {
        picker.current.open = false;
        picker.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  return <section className="sprint-panel sprint-calendar" aria-label={label}>
    <div className="sprint-calendar__heading"><strong>{label}</strong>{playerName && <span>{playerName}</span>}</div>
    <details ref={picker} className="sprint-calendar__picker" onToggle={(event) => {
      if (event.currentTarget.open) {
        if (disabled) event.currentTarget.open = false;
        else setMonth(selectedDate.slice(0, 7));
      }
    }}>
      <summary aria-disabled={disabled} className={completed.has(selectedDate) ? 'sprint-calendar__trigger--completed' : available.has(selectedDate) ? 'sprint-calendar__trigger--available' : ''}>
        <time dateTime={selectedDate}>{selectedDate}</time>{completed.has(selectedDate) && <span>✓</span>}<span aria-hidden="true">▾</span>
      </summary>
      <div className="sprint-calendar__popup">
        <div className="sprint-calendar__navigation">
          <button type="button" disabled={disabled || monthIndex <= 0} onClick={() => setMonth(months[monthIndex - 1])}
            aria-label={language === 'lt' ? 'Ankstesnis mėnuo' : 'Previous month'}>‹</button>
          <select value={month} disabled={disabled} aria-label={language === 'lt' ? 'Mėnuo' : 'Month'} onChange={(event) => setMonth(event.target.value)}>
            {months.map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
          </select>
          <button type="button" disabled={disabled || monthIndex >= months.length - 1} onClick={() => setMonth(months[monthIndex + 1])}
            aria-label={language === 'lt' ? 'Kitas mėnuo' : 'Next month'}>›</button>
        </div>
        <div className="sprint-calendar__days">
          {weekdays.map((day) => <span className="sprint-calendar__weekday" key={day}>{day}</span>)}
          {Array.from({ length: cells }, (_, index) => {
            const day = index - offset + 1;
            if (day < 1 || day > dayCount) return <span key={`empty-${index}`} />;
            const date = `${month}-${String(day).padStart(2, '0')}`;
            const done = completed.has(date);
            return <button key={date} type="button" disabled={disabled || !available.has(date)}
              className={`sprint-calendar__day${done ? ' sprint-calendar__day--completed' : available.has(date) ? ' sprint-calendar__day--available' : ''}${date === selectedDate ? ' sprint-calendar__day--selected' : ''}`}
              aria-current={date === selectedDate ? 'date' : undefined} aria-label={`${date}${done ? ` · ${doneLabel}` : ''}`}
              onClick={() => { picker.current.open = false; onSelect(date); }}>
              {day}{done && <span aria-hidden="true">✓</span>}
            </button>;
          })}
        </div>
      </div>
    </details>
  </section>;
}

export default SprintCalendar;
